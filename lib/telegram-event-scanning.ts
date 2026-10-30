import { randomUUID } from 'node:crypto';
import type { Prisma, TelegramMessage, TelegramSource } from '@prisma/client';
import { prisma } from '../app/lib/prisma';
import { normalizeCoverImage } from './event-cover';
import { lockTelegramConnection } from './telegram-store';
import { TelegramError, decryptTelegramToken, readTelegramBody, telegramApi, verifyTelegramSource } from './telegram-connection';
import { extractSocialEvents, previewSocialEvents, publishSocialEvents, socialCandidates, socialFingerprint } from './social-event-extraction';
import type { SocialCandidate, SocialExtraction } from './social-event-extraction';

type Extraction = SocialExtraction;
export type TelegramScanResult = { status: string; dryRun: boolean; visited: number; published: number; duplicates: number; discarded: number; retried: number; failed: number; wouldPublish: number; deferred: number; imageOmitted: number };
const cleared = { rawText: null, photoFileId: null, leaseId: null, leasedUntil: null };
const commitBudgetMs = 17_000;
const invalidExtraction = () => new TelegramError('telegram_invalid_extraction', 502);

export function telegramCandidates(payload: unknown, sourceText: string, today?: string) {
  return socialCandidates(payload, sourceText, invalidExtraction, today);
}

export function telegramFingerprint(event: Pick<SocialCandidate, 'title' | 'date' | 'location' | 'time'>): string {
  return socialFingerprint(event);
}

export function telegramPublicSource(username: string | null, type: string, messageId: number): string | null {
  return type === 'channel' && username && /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(username) ? `https://t.me/${username}/${messageId}` : null;
}

export async function downloadTelegramPhoto(token: string, fileId: string, signal: AbortSignal): Promise<Buffer> {
  const file = await telegramApi<{ file_path?: string; file_size?: number }>(token, 'getFile', { file_id: fileId }, signal);
  if (!file.file_path || !/^[A-Za-z0-9_/-]+\.(?:jpg|jpeg|png|webp)$/.test(file.file_path) || file.file_path.includes('..') || !file.file_size || file.file_size > 4 * 1024 * 1024) throw new TelegramError('telegram_invalid_photo');
  try {
    const response = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]), redirect: 'error', cache: 'no-store',
    });
    if (!response.ok) throw new Error();
    return await normalizeCoverImage(Buffer.from(await readTelegramBody(response, 4 * 1024 * 1024)), signal);
  } catch { throw new TelegramError('telegram_photo_unavailable', 502); }
}

export async function extractTelegramEvents(job: TelegramMessage, token: string, signal: AbortSignal): Promise<Extraction> {
  const text = job.rawText || '';
  let photo: Buffer | undefined;
  if (job.photoFileId) {
    try {
      photo = await downloadTelegramPhoto(token, job.photoFileId, signal);
    } catch (error) {
      if (!text.trim() || !(error instanceof TelegramError) || !['telegram_file_rejected', 'telegram_invalid_photo', 'telegram_photo_unavailable'].includes(error.code)) throw error;
    }
  }
  return extractSocialEvents({ text, image: photo, signal, fail: invalidExtraction });
}

const due = (now: Date): Prisma.TelegramMessageWhereInput => ({
  expiresAt: { gt: now }, attempts: { lt: 3 },
  OR: [{ status: 'pending', nextAttemptAt: { lte: now } }, { status: 'processing', leasedUntil: { lte: now } }],
});

export async function publishTelegramJob(job: TelegramMessage, source: TelegramSource, leaseId: string, extraction: Extraction, publicUsername: string | null, deadline = Number.POSITIVE_INFINITY) {
  if (Date.now() + commitBudgetMs > deadline) throw new TelegramError('telegram_budget_exhausted', 503);
  return prisma.$transaction(async tx => {
    const connection = await lockTelegramConnection(tx, source.connectionId);
    const currentSource = await tx.telegramSource.findUnique({ where: { id: source.id } });
    const current = await tx.telegramMessage.findUnique({ where: { id: job.id } });
    if (connection?.status !== 'active' || !connection.encryptedToken || !currentSource?.isActive || !currentSource.consentedAt ||
      currentSource.revision !== source.revision ||
      !current || current.version !== job.version || current.status !== 'processing' || current.leaseId !== leaseId ||
      !current.leasedUntil || current.leasedUntil <= new Date() || current.expiresAt <= new Date()) throw new TelegramError('telegram_job_changed', 409);
    const { published, duplicates } = await publishSocialEvents(tx, extraction, {
      findReceipt: fingerprint => tx.telegramPublication.findUnique({ where: { fingerprint } }),
      createReceipt: (fingerprint, eventId) => tx.telegramPublication.create({ data: { fingerprint, messageId: job.id, eventId } }),
      eventData: (_event, fingerprint) => ({
        origin: 'telegram', sourceUrl: telegramPublicSource(publicUsername, source.chatType, job.messageId),
        externalId: `telegram:${job.id}:${fingerprint.slice(0, 16)}`,
      }),
    });
    await tx.telegramMessage.update({ where: { id: job.id }, data: {
      ...cleared, status: published || duplicates ? 'published' : 'skipped', publishedCount: published,
      discardedCount: extraction.discarded, lastError: null,
    } });
    return { published, duplicates };
  }, { maxWait: 2_000, timeout: 15_000 });
}

export async function scanTelegramQueue(options: { dryRun: boolean; deadline: number }): Promise<TelegramScanResult> {
  const result: TelegramScanResult = { status: 'success', dryRun: options.dryRun, visited: 0, published: 0, duplicates: 0, discarded: 0, retried: 0, failed: 0, wouldPublish: 0, deferred: 0, imageOmitted: 0 };
  const now = new Date();
  if (!options.dryRun) {
    await prisma.telegramMessage.updateMany({
      where: { status: { in: ['pending', 'processing'] }, OR: [{ expiresAt: { lte: now } }, { attempts: { gte: 3 }, leasedUntil: { lte: now } }] },
      data: { ...cleared, status: 'failed', lastError: 'retention_or_retry_limit' },
    });
  }
  const sources = await prisma.telegramSource.findMany({
    where: { isActive: true, consentedAt: { not: null }, connection: { status: 'active', encryptedToken: { not: null } } },
    include: { connection: true }, orderBy: [{ lastScannedAt: 'asc' }, { id: 'asc' }], take: 50,
  });
  for (const source of sources) {
    if (result.visited >= 2 || Date.now() + commitBudgetMs + 10_000 >= options.deadline) break;
    const job = await prisma.telegramMessage.findFirst({ where: { sourceId: source.id, ...due(new Date()) }, orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }] });
    if (!options.dryRun) await prisma.telegramSource.updateMany({ where: { id: source.id }, data: { lastScannedAt: new Date() } });
    if (!job) continue;
    const leaseId = randomUUID();
    if (!options.dryRun) {
      const claim = await prisma.telegramMessage.updateMany({ where: { id: job.id, version: job.version, ...due(new Date()) }, data: {
        status: 'processing', leaseId, leasedUntil: new Date(Date.now() + 60_000), attempts: { increment: 1 },
      } });
      if (!claim.count) continue;
    }
    result.visited++;
    const signal = AbortSignal.timeout(Math.max(1, Math.min(40_000, options.deadline - Date.now() - commitBudgetMs)));
    try {
      const token = decryptTelegramToken(source.connection.encryptedToken!);
      const verified = await verifyTelegramSource(token, source.chatId, signal);
      if (!options.dryRun) await prisma.telegramSource.updateMany({ where: { id: source.id, isActive: true, revision: source.revision }, data: {
        verifiedAt: new Date(), publicUsername: verified.username, lastError: null,
      } });
      const extraction = await extractTelegramEvents(job, token, signal);
      signal.throwIfAborted();
      const finalVerification = await verifyTelegramSource(token, source.chatId, signal);
      if (job.photoFileId && !extraction.imageUrl) result.imageOmitted++;
      if (options.dryRun) {
        const preview = await previewSocialEvents(extraction.events, async fingerprint => Boolean(await prisma.telegramPublication.findUnique({ where: { fingerprint } })));
        result.duplicates += preview.duplicates;
        result.wouldPublish += preview.wouldPublish;
      } else {
        const saved = await publishTelegramJob(job, source, leaseId, extraction, finalVerification.username, options.deadline);
        result.published += saved.published;
        result.duplicates += saved.duplicates;
      }
      result.discarded += extraction.discarded;
    } catch (error) {
      const code = error instanceof TelegramError ? error.code : 'telegram_processing_unavailable';
      const revoked = ['telegram_token_revoked', 'telegram_source_forbidden', 'bot_not_member', 'privacy_mode_limited', 'protected_content', 'unsupported_chat'].includes(code);
      const terminal = revoked || job.attempts + 1 >= 3 || ['telegram_file_rejected', 'telegram_invalid_photo', 'telegram_job_changed'].includes(code);
      if (!options.dryRun) {
        await prisma.$transaction(async tx => {
          const connection = await lockTelegramConnection(tx, source.connectionId);
          const currentSource = await tx.telegramSource.findUnique({ where: { id: source.id } });
          const currentJob = await tx.telegramMessage.findUnique({ where: { id: job.id } });
          if (connection?.status !== 'active' || connection.encryptedToken !== source.connection.encryptedToken ||
            connection.webhookSecretHash !== source.connection.webhookSecretHash || !currentSource?.isActive || !currentSource.consentedAt ||
            currentSource.revision !== source.revision || !currentJob || currentJob.version !== job.version ||
            currentJob.status !== 'processing' || currentJob.leaseId !== leaseId || !currentJob.leasedUntil || currentJob.leasedUntil <= new Date()) return;
          if (code === 'telegram_token_revoked') {
            await tx.telegramConnection.updateMany({ where: { id: source.connectionId }, data: { status: 'revoked', encryptedToken: null, webhookSecretHash: null, lastError: code } });
            await tx.telegramSource.updateMany({ where: { connectionId: source.connectionId }, data: { isActive: false, consentedAt: null, revision: { increment: 1 }, lastError: code } });
            await tx.telegramMessage.updateMany({ where: { source: { connectionId: source.connectionId }, status: { in: ['pending', 'processing'] } }, data: { ...cleared, status: 'failed', lastError: code } });
          } else if (revoked) {
            await tx.telegramSource.updateMany({ where: { id: source.id }, data: { isActive: false, consentedAt: null, revision: { increment: 1 }, lastError: code } });
            await tx.telegramMessage.updateMany({ where: { sourceId: source.id, status: { in: ['pending', 'processing'] } }, data: { ...cleared, status: 'failed', lastError: code } });
          } else {
            await tx.telegramMessage.updateMany({ where: { id: job.id, version: job.version, leaseId, status: 'processing' }, data: {
              ...(terminal ? cleared : { leaseId: null, leasedUntil: null }), status: terminal ? 'failed' : 'pending', lastError: code,
              nextAttemptAt: new Date(Date.now() + 60_000 * 2 ** job.attempts),
            } });
          }
        });
      }
      if (terminal) result.failed++; else result.retried++;
    }
  }
  result.deferred = await prisma.telegramMessage.count({ where: {
    status: { in: ['pending', 'processing'] }, source: { isActive: true, connection: { status: 'active' } },
  } });
  result.status = result.failed || result.retried ? 'partial-error' : result.deferred ? 'partial' : options.dryRun ? 'dry-run' : 'success';
  return result;
}