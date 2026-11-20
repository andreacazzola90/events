import 'server-only';
import { randomUUID } from 'node:crypto';
import type { EventCreationJob, Prisma } from '@prisma/client';
import sharp from 'sharp';
import { prisma } from '../app/lib/prisma';
import { ImageScanError, scanPosterImage } from '../app/api/process-image/scan';
import { processCalendarDeliveries } from '../app/lib/google-calendar';
import { getSupabaseClient } from '../app/lib/supabase';
import { verifyPosterCover } from './verify-poster-cover';
import { createEventWithSeries } from './event-series-create';
import { findDuplicateEvent, lockEventDates } from './event-duplicates';
import { generateUniqueSlug } from './slug-utils';
import { getAutopilotDecision } from './event-autopilot';
import { extractEventSections } from './poster-sections';
import { toIsoDate } from './event-utils';
import { getEventStartTime } from './event-display';
import { geocodeLocation } from './geocoding';
import { invalidatePublicEvents } from './public-event-cache';
import { JOB_HISTORY_TTL_MS, JOB_LEASE_MS, MAX_JOB_ATTEMPTS, jobHash, retryJobAt } from './event-creation-job-policy';

type JobEvent = { index: number; status: 'published' | 'duplicate' | 'review'; eventId?: number; slug?: string; seriesSlug?: string };
export type JobOutcome = { reason?: string; events: JobEvent[] };
type Claim = EventCreationJob & { leaseToken: string };

const activeStatuses = ['queued', 'processing'];
const permanentCropFailures = ['bounds-rejected', 'verification-rejected', 'image-invalid', 'not-configured'];

function eligible(now: Date): Prisma.EventCreationJobWhereInput {
  return {
    inputExpiresAt: { gt: now }, input: { not: null }, attempts: { lt: MAX_JOB_ATTEMPTS },
    OR: [
      { status: 'queued', nextAttemptAt: { lte: now } },
      { status: 'processing', leaseUntil: { lte: now } },
    ],
  };
}

async function claim(id?: string): Promise<Claim | null> {
  const now = new Date();
  const where = eligible(now);
  const key = id ?? (await prisma.eventCreationJob.findFirst({
    where, orderBy: { createdAt: 'asc' }, select: { id: true },
  }))?.id;
  if (!key) return null;
  const leaseToken = randomUUID();
  const [job] = await prisma.eventCreationJob.updateManyAndReturn({
    where: { ...where, id: key },
    data: { status: 'processing', attempts: { increment: 1 }, leaseToken, leaseUntil: new Date(+now + JOB_LEASE_MS) },
  });
  return job ? { ...job, leaseToken } : null;
}

function lease(job: Claim): Prisma.EventCreationJobWhereInput {
  return { id: job.id, status: 'processing', leaseToken: job.leaseToken, leaseUntil: { gt: new Date() }, inputExpiresAt: { gt: new Date() } };
}

async function finish(client: Pick<Prisma.TransactionClient, 'eventCreationJob'>, job: Claim, status: 'published' | 'review' | 'failed', outcome: JobOutcome) {
  const updated = await client.eventCreationJob.updateMany({
    where: lease(job),
    data: {
      status, outcome, leaseToken: null, leaseUntil: null, cachePending: status === 'published',
      ...(status === 'published' ? { input: null } : {}),
    },
  });
  if (!updated.count) throw new Error('lease-expired');
}

async function refreshPublished(id?: string) {
  const jobs = await prisma.eventCreationJob.findMany({
    where: { cachePending: true, ...(id ? { id } : {}) },
    select: { id: true, outcome: true }, take: 100,
  });
  for (const job of jobs) {
    const outcome = job.outcome as JobOutcome | null;
    const refreshed = outcome?.events.map(({ slug, seriesSlug }) => invalidatePublicEvents({ slug, seriesSlug }));
    if (refreshed?.every(Boolean)) {
      await prisma.eventCreationJob.updateMany({ where: { id: job.id, cachePending: true }, data: { cachePending: false } });
    }
  }
}

function isRealDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === date;
}

async function processJob(job: Claim, signal: AbortSignal) {
  const input = new File([new Uint8Array(job.input!)], 'locandina', { type: job.mimeType });
  const { crop, reason } = await verifyPosterCover(input, job.ownerId ?? undefined, signal);
  if (!crop) {
    if (!permanentCropFailures.includes(reason)) throw new Error('crop-unavailable');
    await finish(prisma, job, 'review', { reason: 'cover-failed', events: [] });
    return;
  }
  signal.throwIfAborted();
  // Analyze only the privacy-verified area. Even an already clean original is re-encoded without metadata.
  const poster = await sharp(crop).jpeg({ quality: 90 }).toBuffer();
  const { events: candidates } = await scanPosterImage(new File([new Uint8Array(poster)], 'locandina.jpg', { type: 'image/jpeg' }), signal, true);
  const identities = new Set<string>();
  const events = candidates.map(event => ({
    ...event,
    time: getEventStartTime(event.time) || '',
    date: toIsoDate(event.date),
    location: event.location.replace(/\s+/g, ' ').trim(),
  })).filter(event => {
    const identity = JSON.stringify([event.title, event.date, event.time, event.location].map(value => value.trim().toLowerCase()));
    if (identities.has(identity)) return false;
    identities.add(identity);
    return true;
  });
  const review = (reason: string) => finish(prisma, job, 'review', {
    reason, events: events.map((_, index) => ({ index, status: 'review' })),
  });
  const decision = getAutopilotDecision({
    events, needsReview: events.length > 30, duplicates: [],
    duplicatesChecked: true, cropStatus: 'completed', sectionsPending: false,
  });
  if (decision.action === 'stop') return review(decision.reason);
  const dates = events.map(event => event.date);
  if (dates.some(date => !isRealDate(date))) return review('missing-data');
  const duplicates = await Promise.all(events.map((event, index) => findDuplicateEvent({ ...event, date: dates[index] })));
  if (duplicates.some(Boolean)) return finish(prisma, job, 'review', {
    reason: 'duplicate', events: duplicates.map((match, index) => ({ index, status: match ? 'duplicate' : 'review' })),
  });
  const sections = events.length > 1
    ? await extractEventSections(poster, events, AbortSignal.any([signal, AbortSignal.timeout(25_000)])).catch(() => [])
    : [];
  signal.throwIfAborted();
  const bucket = getSupabaseClient(signal).storage.from('events');
  const urls = new Map<string, string>();
  const covers: string[] = [];
  for (let index = 0; index < events.length; index++) {
    const image = sections.find(item => item.index === index)?.image ?? poster;
    const jpg = await sharp(image).resize({ width: 1200, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    const digest = jobHash(jpg);
    if (!urls.has(digest)) {
      signal.throwIfAborted();
      const path = `creation/${job.id}-${digest}.jpg`;
      const { error } = await bucket.upload(path, jpg, { contentType: 'image/jpeg', upsert: false });
      if (error && !('statusCode' in error && String(error.statusCode) === '409')) throw new Error('cover-storage-unavailable');
      urls.set(digest, bucket.getPublicUrl(path).data.publicUrl);
    }
    covers.push(urls.get(digest)!);
  }
  const locations = new Map<string, Awaited<ReturnType<typeof geocodeLocation>>>();
  for (const location of new Set(events.map(event => event.location))) {
    signal.throwIfAborted();
    locations.set(location, await geocodeLocation(location));
  }
  signal.throwIfAborted();
  await prisma.$transaction(async tx => {
    // Exactly one attempt can commit. The lease check and all public writes share the same transaction.
    await lockEventDates(tx, dates);
    const results: JobEvent[] = [];
    for (let index = 0; index < events.length; index++) {
      const { title, description, time, location, organizer, category, price, sourceUrl, seriesTitle } = events[index];
      if (await findDuplicateEvent({ title, date: dates[index], time, sourceUrl }, tx)) {
        throw new ImageScanError('duplicate', 422, 'duplicate');
      }
      const { event, seriesSlug } = await createEventWithSeries({
        title, description, date: dates[index], time, location, organizer, category: category.toLowerCase().trim(),
        price, sourceUrl: sourceUrl || null, rawText: '', imageUrl: covers[index],
        origin: 'user', createdById: job.ownerId, ...locations.get(location),
      }, seriesTitle, tx);
      results.push({ index, status: 'published', eventId: event.id, slug: generateUniqueSlug(event.title, event.id), ...(seriesSlug ? { seriesSlug } : {}) });
    }
    signal.throwIfAborted();
    await finish(tx, job, 'published', { events: results });
  }, { timeout: 15_000 });
}

export async function runEventCreationJob(id?: string, budgetMs = 220_000) {
  const job = await claim(id);
  if (!job) return false;
  try {
    await processJob(job, AbortSignal.timeout(budgetMs));
  } catch (error) {
    if (error instanceof ImageScanError && error.status < 500) {
      await finish(prisma, job, 'review', { reason: error.code ?? 'missing-data', events: [] });
    } else {
      console.warn('[event-creation] Attempt interrupted; durable retry scheduled', { id: job.id, attempt: job.attempts });
      await prisma.eventCreationJob.updateMany({
        where: lease(job),
        data: {
          status: job.attempts < MAX_JOB_ATTEMPTS ? 'queued' : 'failed',
          leaseToken: null, leaseUntil: null, nextAttemptAt: retryJobAt(job.attempts, new Date()),
        },
      });
    }
  }
  await refreshPublished(job.id);
  return true;
}

export async function runEventCreationRecovery() {
  const now = new Date();
  await prisma.eventCreationJob.updateMany({
    where: { status: { in: activeStatuses }, OR: [
      { inputExpiresAt: { lte: now } },
      { attempts: { gte: MAX_JOB_ATTEMPTS }, leaseUntil: { lte: now } },
    ] },
    data: { status: 'failed', leaseToken: null, leaseUntil: null },
  });
  await prisma.eventCreationJob.updateMany({
    where: { input: { not: null }, inputExpiresAt: { lte: now } }, data: { input: null },
  });
  await refreshPublished();
  await prisma.eventCreationJob.deleteMany({ where: { createdAt: { lte: new Date(+now - JOB_HISTORY_TTL_MS) }, cachePending: false } });
  // Drain in small batches within a single Hobby-compatible daily invocation.
  let processed = 0;
  const deadline = +now + 235_000;
  for (let batch = 0; batch < 6 && deadline - Date.now() >= 45_000; batch++) {
    const budget = deadline - Date.now();
    const pending = await prisma.eventCreationJob.findMany({
      where: eligible(new Date()), orderBy: { createdAt: 'asc' }, take: 4, select: { id: true },
    });
    if (!pending.length) break;
    const settled = await Promise.allSettled(pending.map(({ id }) => runEventCreationJob(id, budget)));
    processed += settled.filter(result => result.status === 'fulfilled' && result.value).length;
  }
  return { processed };
}

export async function kickEventCreationJob(id: string) {
  try {
    if (await runEventCreationJob(id)) await processCalendarDeliveries(10);
  } catch {
    console.warn('[event-creation] Worker interrupted; the scheduled worker will recover', { id });
  }
}
