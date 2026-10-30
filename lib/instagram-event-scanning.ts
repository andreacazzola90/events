import type { InstagramScanConnection, InstagramScanSource } from '@prisma/client';
import { prisma } from '../app/lib/prisma';
import { InstagramScanError, decryptInstagramToken, downloadInstagramMedia, fetchInstagramBusinessPosts, fetchInstagramStories } from './instagram-scan-connection';
import type { InstagramMedia } from './instagram-scan-connection';
import { lockInstagramConnection, markInstagramConnectionExpired } from './instagram-scan-store';
import { extractSocialEvents, previewSocialEvents, publishSocialEvents } from './social-event-extraction';
import type { SocialExtraction, SocialFailure } from './social-event-extraction';

export const INSTAGRAM_MAX_MEDIA_PER_RUN = 12;
const STORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const POST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const commitBudgetMs = 17_000;
const mediaBudgetMs = 60_000;
const admissionReserveMs = commitBudgetMs + mediaBudgetMs;
export const INSTAGRAM_MAX_ATTEMPTS = 3;
const STALE_PROCESSING_MS = 10 * 60 * 1000;
// Deterministic outcomes: retrying would give the same result, so the media is closed for good.
const terminalCodes = new Set(['instagram_invalid_extraction', 'instagram_media_rejected', 'payload_too_large']);
const invalidExtraction: SocialFailure = () => new InstagramScanError('instagram_invalid_extraction', 502);

export type InstagramScanResult = {
  status: string; dryRun: boolean; reason?: string; connections: number; visited: number; published: number; duplicates: number;
  discarded: number; failed: number; wouldPublish: number; skipped: number; deferred: number; sourceErrors: number; expired: number; imageOmitted: number;
};

export type InstagramScanDeps = {
  fetchStories: typeof fetchInstagramStories;
  fetchPosts: typeof fetchInstagramBusinessPosts;
  downloadMedia: typeof downloadInstagramMedia;
  extract: (options: { text: string; image?: Buffer; signal: AbortSignal; fail: SocialFailure }) => Promise<SocialExtraction>;
};

const errorCode = (error: unknown) => error instanceof InstagramScanError ? error.code : 'instagram_processing_unavailable';
const isUniqueViolation = (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');

export function instagramEventSourceUrl(media: InstagramMedia, profileUsername: string): string {
  return media.kind === 'post' && media.permalink ? media.permalink : `https://www.instagram.com/${profileUsername}/`;
}

async function publishInstagramItem(connection: InstagramScanConnection, source: InstagramScanSource | null, media: InstagramMedia, itemId: string, extraction: SocialExtraction, deadline: number) {
  if (Date.now() + commitBudgetMs > deadline) throw new InstagramScanError('instagram_budget_exhausted', 503);
  return prisma.$transaction(async tx => {
    const locked = await lockInstagramConnection(tx, connection.id);
    if (locked?.status !== 'active' || !locked.encryptedToken || locked.encryptedToken !== connection.encryptedToken) throw new InstagramScanError('instagram_job_changed', 409);
    if (source) {
      const current = await tx.instagramScanSource.findUnique({ where: { id: source.id } });
      if (!current?.isActive || !current.consentedAt) throw new InstagramScanError('instagram_job_changed', 409);
    }
    const sourceUrl = instagramEventSourceUrl(media, source?.username || connection.username);
    const saved = await publishSocialEvents(tx, extraction, {
      findReceipt: fingerprint => tx.instagramPublication.findUnique({ where: { fingerprint } }),
      createReceipt: (fingerprint, eventId) => tx.instagramPublication.create({ data: { fingerprint, itemId, eventId } }),
      eventData: (_event, fingerprint) => ({ origin: 'instagram', sourceUrl, externalId: `instagram:${media.id}:${fingerprint.slice(0, 16)}` }),
    });
    await tx.instagramScanItem.update({ where: { id: itemId }, data: {
      status: saved.published || saved.duplicates ? 'published' : 'skipped', publishedCount: saved.published,
      discardedCount: extraction.discarded, lastError: null,
    } });
    return saved;
  }, { maxWait: 2_000, timeout: 15_000 });
}

/** Daily Instagram lot: own stories plus Business Discovery posts, each media analyzed at most once. */
export async function scanInstagram(options: { dryRun: boolean; deadline: number; now?: Date; deps?: Partial<InstagramScanDeps> }): Promise<InstagramScanResult> {
  const deps: InstagramScanDeps = {
    fetchStories: fetchInstagramStories, fetchPosts: fetchInstagramBusinessPosts, downloadMedia: downloadInstagramMedia, extract: extractSocialEvents,
    ...options.deps,
  };
  const { dryRun, deadline } = options;
  const now = options.now || new Date();
  const result: InstagramScanResult = {
    status: 'success', dryRun, connections: 0, visited: 0, published: 0, duplicates: 0, discarded: 0, failed: 0,
    wouldPublish: 0, skipped: 0, deferred: 0, sourceErrors: 0, expired: 0, imageOmitted: 0,
  };
  const connections = await prisma.instagramScanConnection.findMany({
    where: { status: 'active', encryptedToken: { not: null } }, orderBy: [{ lastRunAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }], take: 5,
  });
  if (!connections.length) return { ...result, status: 'skipped', reason: 'not_connected' };

  for (const connection of connections) {
    result.connections++;
    const counts = { visited: 0, published: 0, duplicates: 0, discarded: 0, failed: 0 };
    let lastError: string | null = null;
    const encryptedToken = connection.encryptedToken!;

    const handle = async (media: InstagramMedia, source: InstagramScanSource | null) => {
      const seen = await prisma.instagramScanItem.findUnique({ where: { connectionId_mediaId: { connectionId: connection.id, mediaId: media.id } } });
      const retryable = Boolean(seen && seen.attempts < INSTAGRAM_MAX_ATTEMPTS &&
        (seen.status === 'retry' || (seen.status === 'processing' && now.getTime() - seen.updatedAt.getTime() > STALE_PROCESSING_MS)));
      if (seen && !retryable) { result.skipped++; return; }
      if (result.visited >= INSTAGRAM_MAX_MEDIA_PER_RUN || Date.now() + admissionReserveMs >= deadline) { result.deferred++; return; }
      const base = { connectionId: connection.id, mediaId: media.id, kind: media.kind, sourceUsername: source?.username || null };
      if (!media.imageUrl && !media.caption.trim()) {
        result.visited++; counts.visited++; result.discarded++; counts.discarded++;
        if (!dryRun) {
          try { await prisma.instagramScanItem.create({ data: { ...base, status: 'discarded', discardedCount: 1, lastError: 'instagram_media_unsupported' } }); }
          catch (error) { if (!isUniqueViolation(error)) throw error; }
        }
        return;
      }
      let itemId = '';
      let attempts = 1;
      if (!dryRun && seen) {
        // Compare-and-set on status/updatedAt so concurrent runs cannot both reclaim the same media.
        const claimed = await prisma.instagramScanItem.updateMany({
          where: { id: seen.id, status: seen.status, updatedAt: seen.updatedAt },
          data: { status: 'processing', attempts: { increment: 1 }, lastError: null },
        });
        if (!claimed.count) { result.skipped++; return; }
        itemId = seen.id;
        attempts = seen.attempts + 1;
      } else if (!dryRun) {
        try { itemId = (await prisma.instagramScanItem.create({ data: base })).id; }
        catch (error) {
          if (isUniqueViolation(error)) { result.skipped++; return; }
          throw error;
        }
      }
      result.visited++; counts.visited++;
      const signal = AbortSignal.timeout(Math.max(1, Math.min(mediaBudgetMs, deadline - Date.now() - commitBudgetMs)));
      try {
        let image: Buffer | undefined;
        if (media.imageUrl) {
          try { image = await deps.downloadMedia(media.imageUrl, signal); }
          catch (error) { if (!media.caption.trim()) throw error; }
        }
        const extraction = await deps.extract({ text: media.caption, image, signal, fail: invalidExtraction });
        signal.throwIfAborted();
        if (media.imageUrl && extraction.events.length && !extraction.imageUrl) result.imageOmitted++;
        result.discarded += extraction.discarded; counts.discarded += extraction.discarded;
        if (dryRun) {
          const preview = await previewSocialEvents(extraction.events, async fingerprint => Boolean(await prisma.instagramPublication.findUnique({ where: { fingerprint } })));
          result.wouldPublish += preview.wouldPublish;
          result.duplicates += preview.duplicates; counts.duplicates += preview.duplicates;
        } else {
          const saved = await publishInstagramItem(connection, source, media, itemId, extraction, deadline);
          result.published += saved.published; counts.published += saved.published;
          result.duplicates += saved.duplicates; counts.duplicates += saved.duplicates;
        }
      } catch (error) {
        const code = errorCode(error);
        result.failed++; counts.failed++;
        const status = terminalCodes.has(code) || attempts >= INSTAGRAM_MAX_ATTEMPTS ? 'failed' : 'retry';
        if (!dryRun) await prisma.instagramScanItem.updateMany({ where: { id: itemId, status: 'processing' }, data: { status, lastError: code } });
        if (code === 'instagram_token_expired') throw error;
      }
    };

    try {
      if (connection.tokenExpiresAt && connection.tokenExpiresAt <= now) throw new InstagramScanError('instagram_token_expired', 401);
      const token = decryptInstagramToken(encryptedToken);
      const budgetSignal = () => AbortSignal.timeout(Math.max(1, Math.min(15_000, deadline - Date.now() - commitBudgetMs)));
      try {
        const stories = await deps.fetchStories(token, connection.igUserId, budgetSignal());
        for (const story of stories) {
          if (story.timestamp && now.getTime() - story.timestamp.getTime() > STORY_WINDOW_MS) continue;
          await handle(story, null);
        }
      } catch (error) {
        if (errorCode(error) === 'instagram_token_expired') throw error;
        result.sourceErrors++;
        lastError = errorCode(error);
      }
      const sources = await prisma.instagramScanSource.findMany({
        where: { connectionId: connection.id, isActive: true, consentedAt: { not: null } },
        orderBy: [{ lastScannedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }], take: 20,
      });
      for (const source of sources) {
        if (result.visited >= INSTAGRAM_MAX_MEDIA_PER_RUN || Date.now() + admissionReserveMs >= deadline) { result.deferred++; continue; }
        let posts: InstagramMedia[];
        try {
          posts = await deps.fetchPosts(token, connection.igUserId, source.username, budgetSignal());
        } catch (error) {
          const code = errorCode(error);
          if (code === 'instagram_token_expired') throw error;
          result.sourceErrors++;
          lastError = 'instagram_source_errors';
          if (!dryRun) await prisma.instagramScanSource.updateMany({ where: { id: source.id }, data: { lastError: code, lastScannedAt: new Date() } });
          continue;
        }
        if (!dryRun) await prisma.instagramScanSource.updateMany({ where: { id: source.id }, data: { lastError: null, lastScannedAt: new Date() } });
        const recent = posts
          .filter(post => post.timestamp && post.timestamp.getTime() <= now.getTime() + 60_000 && now.getTime() - post.timestamp.getTime() <= POST_WINDOW_MS)
          .sort((first, second) => first.timestamp!.getTime() - second.timestamp!.getTime());
        for (const post of recent) await handle(post, source);
      }
    } catch (error) {
      lastError = errorCode(error);
      if (lastError === 'instagram_token_expired') {
        result.expired++;
        if (!dryRun) await markInstagramConnectionExpired(connection.id, encryptedToken);
      } else {
        result.failed++; counts.failed++;
      }
    }
    if (!dryRun) {
      await prisma.instagramScanConnection.updateMany({ where: { id: connection.id }, data: {
        lastRunAt: new Date(), lastError, lastVisited: counts.visited, lastPublished: counts.published,
        lastDuplicates: counts.duplicates, lastDiscarded: counts.discarded, lastFailed: counts.failed,
      } });
    }
  }
  result.status = result.failed || result.sourceErrors || result.expired ? 'partial-error' : result.deferred ? 'partial' : dryRun ? 'dry-run' : 'success';
  return result;
}
