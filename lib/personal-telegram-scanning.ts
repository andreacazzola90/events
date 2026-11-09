import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { createWorker } from 'tesseract.js';
import { prisma } from '../app/lib/prisma';
import { MessagingError, workerConfiguration } from './personal-messaging';
import type { Platform } from './personal-messaging';
import { announcementCandidateExcerpt, isPrivateAnnouncement, isPublicEventAnnouncement, permittedAnnouncementText, sanitizePersonalTelegramText } from './personal-telegram-policy';
import { extractSocialEvents, previewSocialEvents, publishSocialEvents, socialFingerprint } from './social-event-extraction';

const retentionMs = 24 * 60 * 60 * 1000;
const leaseMs = 60_000;
const maximumPhotoBytes = 4 * 1024 * 1024;
const maximumMessagesPerRun = 20;
const clearedContent = { rawText: '', photoBytes: null, leaseId: null, leasedUntil: null };
type WorkerMessage = { id: number; text: string; photo?: string };
type WorkerPage = { sourceId: string; sourceRevision: number; cursor: number; messages: WorkerMessage[]; dryRun: boolean; status: string; discarded?: number; readCount?: number };
type ScanOptions = { dryRun: boolean; deadline: number; ownerId?: number; platform?: Platform };
type GrantRow = { id: string; providerId: string; workerRevision: number; revision: number; accountId: string; active: boolean; consentedAt: Date | null; account: { ownerId: number; status: string } };
type PublishFenceJob = { id: string; sourceId: string; sourceRevision: number; leaseId: string; source: { accountId: string; workerRevision: number } };

function validateWorkerPage(page: WorkerPage, grant: { providerId: string; workerRevision: number }, dryRun: boolean) {
  if (!page || page.status !== 'success') throw new Error(page?.status === 'not_connected' ? 'not_connected' : page?.status === 'source_unavailable' ? 'source_unavailable' : 'worker_unavailable');
  if (page.sourceId !== grant.providerId || page.sourceRevision !== grant.workerRevision || page.dryRun !== dryRun ||
    !Number.isSafeInteger(page.cursor) || page.cursor < 0 || page.cursor > 2147483647 ||
    !Array.isArray(page.messages) || page.messages.length > 30 ||
    page.messages.some(item => !item || !Number.isSafeInteger(item.id) || item.id < 1 || item.id > page.cursor || typeof item.text !== 'string' || item.text.length > 4000) ||
    [page.readCount, page.discarded].some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > 30))) throw new Error('worker_unavailable');
}

export async function persistThenAcknowledge<Value>(cursor: number, persist: () => Promise<Value>, acknowledge: (cursor: number) => Promise<unknown>) {
  const value = await persist();
  if (cursor > 0) await acknowledge(cursor);
  return value;
}

export async function assertCurrentPersonalGrant(tx: Prisma.TransactionClient, job: PublishFenceJob) {
  await tx.$executeRaw`SELECT "id" FROM "PersonalMessagingAccount" WHERE "id" = ${job.source.accountId} FOR UPDATE`;
  await tx.$executeRaw`SELECT "id" FROM "PersonalMessagingSource" WHERE "id" = ${job.sourceId} FOR UPDATE`;
  const account = await tx.personalMessagingAccount.findUnique({ where: { id: job.source.accountId } });
  if (account) await tx.$executeRaw`SELECT "id" FROM "User" WHERE "id" = ${account.ownerId} FOR SHARE`;
  const owner = account && await tx.user.findUnique({ where: { id: account.ownerId }, select: { role: true, type: true } });
  const source = await tx.personalMessagingSource.findUnique({ where: { id: job.sourceId } });
  const current = await tx.personalTelegramScanMessage.findUnique({ where: { id: job.id } });
  if (!owner || (owner.role !== 'admin' && owner.type !== 'admin') ||
    account?.status !== 'connected' || !source?.active || source.revision !== job.sourceRevision ||
    source.workerRevision !== job.source.workerRevision || !source.consentedAt ||
    !current || current.sourceRevision !== source.revision || current.status !== 'processing' ||
    current.leaseId !== job.leaseId || !current.leasedUntil || current.leasedUntil <= new Date() ||
    current.expiresAt <= new Date()) throw new Error('personal_telegram_job_changed');
  return source;
}

async function workerRequest<T>(path: '/scan' | '/ack', body: Record<string, unknown>, timeoutMs = 12_000): Promise<T> {
  const { url, secret } = workerConfiguration();
  try {
    const response = await fetch(new URL(path, url), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs), cache: 'no-store',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const reader = response.body?.getReader();
    if (!reader) throw new Error('worker_unavailable');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new Error('worker_unavailable'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
    if (!response.ok || !result || typeof result !== 'object' || Array.isArray(result)) {
      const code = typeof result?.error === 'string' && ['telegram_flood_wait', 'source_unavailable', 'not_connected', 'worker_unavailable'].includes(result.error)
        ? result.error : 'worker_unavailable';
      throw new Error(code);
    }
    return result as T;
  } catch (error) {
    if (error instanceof Error && ['telegram_flood_wait', 'source_unavailable', 'not_connected', 'worker_unavailable'].includes(error.message)) throw error;
    throw new Error('worker_unavailable');
  }
}

export async function revokePersonalTelegramGrant(ownerId: number, providerId?: string, platform: Platform = 'telegram') {
  await prisma.$transaction(async tx => {
    const account = await tx.personalMessagingAccount.findUnique({ where: { ownerId_platform: { ownerId, platform } } });
    if (!account) return;
    await tx.$executeRaw`SELECT "id" FROM "PersonalMessagingAccount" WHERE "id" = ${account.id} FOR UPDATE`;
    await tx.personalMessagingAccount.update({ where: { id: account.id }, data: { revision: { increment: 1 } } });
    const sources = await tx.personalMessagingSource.findMany({ where: { accountId: account.id, ...(providerId ? { providerId } : {}), active: true } });
    await tx.personalMessagingSource.updateMany({
      where: { accountId: account.id, ...(providerId ? { providerId } : {}), active: true },
      data: { active: false, consentedAt: null, revision: { increment: 1 }, lastError: 'source_paused' },
    });
    for (const source of sources) await tx.personalTelegramScanMessage.updateMany({
      where: { sourceId: source.id, status: { in: ['pending', 'processing'] } },
      data: { ...clearedContent, status: 'failed', lastError: 'source_revoked' },
    });
  });
}

export async function personalMessagingSyncRevision(ownerId: number, platform: Platform = 'telegram') {
  const account = await prisma.personalMessagingAccount.upsert({
    where: { ownerId_platform: { ownerId, platform } },
    update: {},
    create: { ownerId, platform, status: 'disconnected' },
  });
  return account.revision;
}

export async function syncPersonalMessagingStatus(ownerId: number, status: {
  status: string; sources: Array<{ id: string; title: string; kind: string; active?: boolean; consentedAt?: string; verifiedAt?: string; revision?: number }>;
}, options: { authorized?: boolean; authorizedSourceId?: string; expectedRevision?: number; platform?: Platform } = {}) {
  const platform = options.platform ?? 'telegram';
  await prisma.$transaction(async tx => {
    const account = await tx.personalMessagingAccount.upsert({
      where: { ownerId_platform: { ownerId, platform } },
      update: { status: status.status },
      create: { ownerId, platform, status: status.status },
    });
    await tx.$executeRaw`SELECT "id" FROM "PersonalMessagingAccount" WHERE "id" = ${account.id} FOR UPDATE`;
    const locked = await tx.personalMessagingAccount.findUnique({ where: { id: account.id } });
    if (options.expectedRevision !== undefined && locked?.revision !== options.expectedRevision) {
      throw new MessagingError('operation_cancelled', 409);
    }
    const rows = await tx.personalMessagingSource.findMany({ where: { accountId: account.id } });
    const seen = new Set<string>();
    for (const source of status.sources) {
      if (!(platform === 'telegram' ? ['group', 'broadcast'].includes(source.kind) : source.kind === 'newsletter') || !source.id || source.id.length > 200) continue;
      seen.add(source.id);
      const current = rows.find(row => row.providerId === source.id);
      const workerRevision = Math.max(1, source.revision || 1);
      if (current && workerRevision < current.workerRevision) continue;
      const active = source.active === true && ['connected', 'restoring'].includes(status.status) &&
        ((options.authorized === true && options.authorizedSourceId === source.id) || current?.active === true);
      const consentedAt = active && source.consentedAt ? new Date(source.consentedAt) : null;
      const changed = !current || current.active !== active || current.workerRevision !== workerRevision ||
        (current.consentedAt?.getTime() ?? null) !== (consentedAt?.getTime() ?? null);
      if (current) {
        if (changed) {
          await tx.personalTelegramScanMessage.updateMany({
            where: { sourceId: current.id, sourceRevision: current.revision, status: { in: ['pending', 'processing'] } },
            data: { ...clearedContent, status: 'failed', lastError: active ? 'source_reauthorized' : 'source_revoked' },
          });
        }
        await tx.personalMessagingSource.update({ where: { id: current.id }, data: {
          title: source.title.slice(0, 200), kind: source.kind, active, workerRevision, consentedAt,
          verifiedAt: source.verifiedAt ? new Date(source.verifiedAt) : current.verifiedAt,
          baselineAt: changed && active ? consentedAt : current.baselineAt,
          revision: changed ? { increment: 1 } : current.revision,
          lastError: changed && active ? null : current.lastError,
        } });
      } else {
        await tx.personalMessagingSource.create({ data: {
          accountId: account.id, providerId: source.id, title: source.title.slice(0, 200), kind: source.kind,
          active, workerRevision, consentedAt, verifiedAt: source.verifiedAt ? new Date(source.verifiedAt) : null,
          baselineAt: active ? consentedAt : null,
        } });
      }
    }
    for (const row of rows) if (!seen.has(row.providerId) && row.active) {
      await tx.personalMessagingSource.update({ where: { id: row.id }, data: { active: false, consentedAt: null, revision: { increment: 1 } } });
    }
  });
}

export async function personalTelegramAdminScanStatus(ownerId: number, platform: Platform = 'telegram') {
  const sources = await prisma.personalMessagingSource.findMany({
    where: { account: { ownerId, platform }, kind: platform === 'telegram' ? 'group' : 'newsletter' },
    select: { id: true, providerId: true, active: true, lastScannedAt: true, lastError: true, messagesSeen: true, messagesDiscarded: true },
  });
  const grouped = await prisma.personalTelegramScanMessage.groupBy({
    by: ['sourceId', 'status'], where: { source: { account: { ownerId, platform } }, status: { in: ['pending', 'processing'] }, expiresAt: { gt: new Date() } },
    _count: { _all: true },
  });
  const backlog = new Map<string, number>();
  for (const item of grouped) backlog.set(item.sourceId, (backlog.get(item.sourceId) || 0) + item._count._all);
  const safeError = (value: string | null) => value && [
    'telegram_flood_wait', 'source_unavailable', 'not_connected', 'worker_unavailable',
    'personal_telegram_extraction_failed', 'personal_telegram_processing_failed',
    'personal_telegram_job_changed', 'personal_telegram_budget_exhausted', 'personal_telegram_ocr_failed', 'retention_expired',
    'source_paused', 'source_revoked', 'source_reauthorized',
  ].includes(value) ? value : undefined;
  return sources.map(source => ({
    sourceId: source.providerId, active: source.active,
    backlog: backlog.get(source.id) || 0,
    lastScannedAt: source.lastScannedAt?.toISOString(), lastError: safeError(source.lastError),
    messagesSeen: source.messagesSeen, messagesDiscarded: source.messagesDiscarded,
  }));
}

function localOcr(bytes: Buffer): Promise<string> {
  return (async () => {
    const worker = await createWorker('ita', 1, { langPath: process.cwd(), gzip: false, cacheMethod: 'none' });
    try {
      const { data } = await worker.recognize(bytes);
      return typeof data.text === 'string' ? data.text.slice(0, 12000) : '';
    } finally { await worker.terminate(); }
  })();
}

async function announcement(message: WorkerMessage, recognize: (image: Buffer) => Promise<string> = localOcr) {
  if (isPrivateAnnouncement(message.text || '')) return '';
  const caption = announcementCandidateExcerpt(message.text || '');
  let image: Buffer | undefined;
  if (message.photo) {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(message.photo) || message.photo.length > Math.ceil(maximumPhotoBytes * 4 / 3) + 8) return '';
    image = Buffer.from(message.photo, 'base64');
    if (!image.length || image.length > maximumPhotoBytes) return '';
    let recognized: string;
    try { recognized = sanitizePersonalTelegramText(await recognize(image)); }
    catch { throw new Error('personal_telegram_ocr_failed'); }
    if (isPrivateAnnouncement(recognized)) return '';
    const poster = announcementCandidateExcerpt(recognized);
    const text = permittedAnnouncementText([caption, poster].filter(Boolean).join('\n'));
    return text ? { text, image } : '';
  }
  const text = permittedAnnouncementText(caption);
  return text ? { text, image } : '';
}

export async function cleanupExpiredPersonalTelegramMessages(
  database: Pick<PrismaClient, 'personalTelegramScanMessage'> = prisma, now = new Date(), scope?: { ownerId?: number; platform: Platform },
) {
  const result = await database.personalTelegramScanMessage.updateMany({
    where: { ...(scope ? { source: { account: scope } } : {}), status: { in: ['pending', 'processing'] }, expiresAt: { lte: now } },
    data: { ...clearedContent, status: 'failed', lastError: 'retention_expired' },
  });
  return result.count;
}

async function persistPage(ownerId: number, sourceRow: GrantRow, page: WorkerPage) {
  if (sourceRow.account.ownerId !== ownerId || !['connected', 'restoring'].includes(sourceRow.account.status) ||
    !sourceRow.active || sourceRow.workerRevision !== page.sourceRevision || sourceRow.providerId !== page.sourceId) throw new Error('source_unavailable');
  const now = new Date();
  const accepted: Array<{ item: WorkerMessage; content: { text: string; image?: Buffer } }> = [];
  for (const item of page.messages) {
    if (!Number.isSafeInteger(item.id) || item.id < 1 || item.id > 2147483647 || typeof item.text !== 'string' || item.text.length > 4000) continue;
    const content = await announcement(item);
    if (content) accepted.push({ item, content });
  }
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT "id" FROM "PersonalMessagingAccount" WHERE "id" = ${sourceRow.accountId} FOR UPDATE`;
    await tx.$executeRaw`SELECT "id" FROM "PersonalMessagingSource" WHERE "id" = ${sourceRow.id} FOR UPDATE`;
    const current = await tx.personalMessagingSource.findUnique({ where: { id: sourceRow.id } });
    const account = await tx.personalMessagingAccount.findUnique({ where: { id: sourceRow.accountId } });
    if (!current?.active || current.revision !== sourceRow.revision || current.workerRevision !== page.sourceRevision ||
      current.consentedAt === null || !account || !['connected', 'restoring'].includes(account.status)) throw new Error('source_unavailable');
    if (account.status === 'restoring') {
      await tx.personalMessagingAccount.update({ where: { id: account.id }, data: { status: 'connected' } });
    }
    for (const { item, content } of accepted) {
      await tx.personalTelegramScanMessage.upsert({
        where: { sourceId_providerMessageId: { sourceId: sourceRow.id, providerMessageId: item.id } },
        update: {},
        create: {
          sourceId: sourceRow.id, providerMessageId: item.id, sourceRevision: sourceRow.revision,
          rawText: content.text, photoBytes: content.image ? Uint8Array.from(content.image) : null, expiresAt: new Date(now.getTime() + retentionMs),
        },
      });
    }
    await tx.personalMessagingSource.update({ where: { id: sourceRow.id }, data: {
      lastScannedAt: now, lastError: null, messagesSeen: { increment: page.readCount || page.messages.length + (page.discarded || 0) },
      messagesDiscarded: { increment: (page.discarded || 0) + page.messages.length - accepted.length },
    } });
  }, { maxWait: 2000, timeout: 15000 });
  return accepted.length;
}

async function classifyDryRun(messages: WorkerMessage[], deadline: number) {
  const results = { visited: 0, wouldPublish: 0, duplicates: 0, discarded: 0, imageOmitted: 0, ocrErrors: 0, failed: 0, deferred: 0 };
  for (const message of messages) {
    if (Date.now() > deadline) break;
    results.visited++;
    try {
      const content = await announcement(message);
      if (!content) { results.discarded++; continue; }
      const extraction = await extractSocialEvents({ text: content.text, signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())), fail: () => new Error('personal_telegram_extraction_failed') });
      results.discarded += extraction.discarded;
      const preview = await previewSocialEvents(extraction.events, async () => false);
      results.wouldPublish += preview.wouldPublish;
      results.duplicates += preview.duplicates;
      if (message.photo && !extraction.imageUrl) results.imageOmitted++;
    } catch (error) {
      if (error instanceof Error && error.message === 'personal_telegram_ocr_failed') results.ocrErrors++;
      else results.failed++;
    }
  }
  results.deferred = messages.length - results.visited;
  return results;
}

async function claimPersonalMessage(deadline: number, scope: { ownerId?: number; platform: Platform }) {
  const candidate = await prisma.personalTelegramScanMessage.findFirst({
    where: { expiresAt: { gt: new Date() }, attempts: { lt: 3 }, source: { active: true, account: {
      ...scope, status: 'connected', owner: { OR: [{ role: 'admin' }, { type: 'admin' }] },
    } },
      OR: [{ status: 'pending', nextAttemptAt: { lte: new Date() } }, { status: 'processing', leasedUntil: { lte: new Date() } }] },
    include: { source: { include: { account: true } } }, orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
  });
  if (!candidate || candidate.sourceRevision !== candidate.source.revision || Date.now() + 18000 > deadline) return undefined;
  const leaseId = randomUUID();
  const claimed = await prisma.personalTelegramScanMessage.updateMany({
    where: { id: candidate.id, attempts: candidate.attempts, sourceRevision: candidate.sourceRevision,
      source: { active: true, revision: candidate.source.revision, account: { ...scope, status: 'connected' } },
      OR: [{ status: 'pending', nextAttemptAt: { lte: new Date() } }, { status: 'processing', leasedUntil: { lte: new Date() } }] },
    data: { status: 'processing', leaseId, leasedUntil: new Date(Date.now() + leaseMs), attempts: { increment: 1 } },
  });
  return claimed.count ? { ...candidate, leaseId } : undefined;
}

async function publishPersonalMessage(job: NonNullable<Awaited<ReturnType<typeof claimPersonalMessage>>>, deadline: number) {
  const currentSource = await prisma.personalMessagingSource.findUnique({ where: { id: job.sourceId } });
  if (!currentSource) throw new Error('source_unavailable');
  const content = await announcement({
    id: job.providerMessageId, text: job.rawText,
    photo: job.photoBytes ? Buffer.from(job.photoBytes).toString('base64') : undefined,
  });
  const text = content ? content.text : '';
  const signal = AbortSignal.timeout(Math.max(1, Math.min(30000, deadline - Date.now() - 15000)));
  const extraction = text
    ? await extractSocialEvents({ text, signal, fail: () => new Error('personal_telegram_extraction_failed') })
    : { events: [], discarded: 1, imageUrl: null };
  signal.throwIfAborted();
  const { published, duplicates } = await prisma.$transaction(async tx => {
    const source = await assertCurrentPersonalGrant(tx, job);
    const result = await publishSocialEvents(tx, extraction, {
      findReceipt: fingerprint => tx.personalTelegramScanPublication.findUnique({ where: { fingerprint } }),
      createReceipt: (fingerprint, eventId) => tx.personalTelegramScanPublication.create({ data: { fingerprint, messageId: job.id, eventId } }),
      eventData: (_event, fingerprint) => ({
        origin: `personal-${job.source.account.platform}`, sourceUrl: null,
        externalId: `personal-${job.source.account.platform}:${job.id}:${fingerprint.slice(0, 16)}`,
      }),
    });
    await tx.personalTelegramScanMessage.update({ where: { id: job.id }, data: {
      ...clearedContent, status: result.published || result.duplicates ? 'published' : 'skipped', lastError: null,
    } });
    if (extraction.discarded) await tx.personalMessagingSource.update({ where: { id: source.id }, data: { messagesDiscarded: { increment: extraction.discarded } } });
    return result;
  }, { maxWait: 2000, timeout: 15000 });
  return { published, duplicates, discarded: extraction.discarded };
}

async function finishFailure(job: NonNullable<Awaited<ReturnType<typeof claimPersonalMessage>>>, code: string) {
  const terminal = job.attempts >= 3 || job.expiresAt <= new Date();
  await prisma.personalTelegramScanMessage.updateMany({
    where: { id: job.id, status: 'processing', leaseId: job.leaseId, sourceRevision: job.sourceRevision },
    data: terminal
      ? { ...clearedContent, status: 'failed', lastError: code }
      : { status: 'pending', nextAttemptAt: new Date(Date.now() + Math.min(60_000, job.attempts * 15_000)), leaseId: null, leasedUntil: null, lastError: code },
  });
  await prisma.personalMessagingSource.updateMany({ where: { id: job.sourceId, active: true }, data: { lastError: code } });
}

export async function scanPersonalTelegramSources(options: ScanOptions) {
  const platform = options.platform ?? 'telegram';
  if (!['telegram', 'whatsapp'].includes(platform) || (platform === 'whatsapp' && (!Number.isSafeInteger(options.ownerId) || options.ownerId! < 1))) throw new MessagingError('invalid_payload');
  const scope = { ...(options.ownerId !== undefined ? { ownerId: options.ownerId } : {}), platform };
  const result = { status: 'success', dryRun: options.dryRun, sources: 0, visited: 0, queued: 0, published: 0, duplicates: 0, discarded: 0, retried: 0, failed: 0, wouldPublish: 0, deferred: 0, imageOmitted: 0, ocrErrors: 0 };
  const grants = await prisma.personalMessagingSource.findMany({
    where: { kind: platform === 'telegram' ? 'group' : 'newsletter', active: true, consentedAt: { not: null }, account: {
      ...scope, status: { in: ['connected', 'restoring'] }, owner: { OR: [{ role: 'admin' }, { type: 'admin' }] },
    } },
    include: { account: true }, orderBy: [{ lastScannedAt: 'asc' }, { id: 'asc' }], take: 20,
  });
  if (options.dryRun) {
    for (const grant of grants) {
      if (Date.now() + 20000 > options.deadline) { result.deferred++; break; }
      try {
        const page = await workerRequest<WorkerPage>('/scan', {
          owner: grant.account.ownerId, platform, source: grant.providerId, sourceRevision: grant.workerRevision, limit: 10, dryRun: true,
        }, Math.min(60000, options.deadline - Date.now()));
        validateWorkerPage(page, grant, true);
        result.sources++; result.visited += page.readCount || page.messages.length;
        const preview = await classifyDryRun(page.messages, options.deadline);
        result.wouldPublish += preview.wouldPublish; result.discarded += preview.discarded + (page.discarded || 0); result.imageOmitted += preview.imageOmitted;
        result.duplicates += preview.duplicates;
        result.ocrErrors += preview.ocrErrors;
        result.failed += preview.failed; result.deferred += preview.deferred;
        if (preview.ocrErrors || preview.failed) result.status = 'partial-error';
      } catch { result.status = 'partial-error'; result.failed++; }
    }
    return result;
  }
  await cleanupExpiredPersonalTelegramMessages(prisma, new Date(), scope);
  for (const grant of grants) {
    if (result.sources >= 5 || Date.now() + 20000 > options.deadline) { result.deferred++; break; }
    try {
      const page = await workerRequest<WorkerPage>('/scan', {
        owner: grant.account.ownerId, platform, source: grant.providerId, sourceRevision: grant.workerRevision, limit: 20, dryRun: false,
      }, Math.min(60000, options.deadline - Date.now()));
      validateWorkerPage(page, grant, false);
      result.sources++; result.visited += page.readCount || page.messages.length;
      const queued = await persistThenAcknowledge(page.cursor, () => persistPage(grant.account.ownerId, grant, page), cursor => workerRequest('/ack', {
        owner: grant.account.ownerId, platform, source: grant.providerId, sourceRevision: grant.workerRevision, cursor,
      }));
      result.queued += queued;
    } catch (error) {
      const code = error instanceof Error && ['telegram_flood_wait', 'source_unavailable', 'not_connected', 'personal_telegram_ocr_failed'].includes(error.message)
        ? error.message : 'worker_unavailable';
      result.status = 'partial-error';
      if (code === 'personal_telegram_ocr_failed') result.ocrErrors++;
      if (code === 'source_unavailable') await revokePersonalTelegramGrant(grant.account.ownerId, grant.providerId, platform);
      if (code === 'not_connected') await prisma.personalMessagingAccount.updateMany({
        where: { id: grant.accountId, status: 'connected' }, data: { status: 'restoring' },
      });
      await prisma.personalMessagingSource.updateMany({ where: { id: grant.id, active: true }, data: { lastError: code } });
    }
  }
  let processed = 0;
  while (Date.now() + 18000 < options.deadline && processed < maximumMessagesPerRun) {
    const job = await claimPersonalMessage(options.deadline, scope);
    if (!job) break;
    processed++;
    try {
      const published = await publishPersonalMessage(job, options.deadline);
      result.published += published.published; result.duplicates += published.duplicates; result.discarded += published.discarded;
    } catch (error) {
      const code = error instanceof Error && ['personal_telegram_job_changed', 'personal_telegram_budget_exhausted', 'personal_telegram_ocr_failed'].includes(error.message)
        ? error.message : 'personal_telegram_processing_failed';
      if (code === 'personal_telegram_ocr_failed') result.ocrErrors++;
      await finishFailure(job, code);
      if (job.attempts >= 3 || job.expiresAt <= new Date()) result.failed++; else result.retried++;
      if (code === 'personal_telegram_ocr_failed') result.status = 'partial-error';
    }
  }
  await cleanupExpiredPersonalTelegramMessages(prisma, new Date(), scope);
  result.deferred += await prisma.personalTelegramScanMessage.count({ where: { source: { account: scope }, status: { in: ['pending', 'processing'] }, expiresAt: { gt: new Date() } } });
  if (result.status !== 'partial-error' && result.failed) result.status = 'partial';
  return result;
}

export const personalTelegramScanTestHelpers = { announcement, classifyDryRun, isPublicEventAnnouncement, socialFingerprint, clearedContent, publishPersonalMessage, validateWorkerPage };
