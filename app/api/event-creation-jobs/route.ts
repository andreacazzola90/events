import { createHmac } from 'node:crypto';
import { after, type NextRequest } from 'next/server';
import sharp from 'sharp';
import { prisma } from '@/lib/prisma';
import { jobOwnerId, jobResponse } from '../../../lib/event-creation-job-access';
import { canReadJob, JOB_HISTORY_TTL_MS, JOB_INPUT_TTL_MS, jobHash, MAX_JOB_IMAGE_BYTES, validJobId, validJobSecret } from '../../../lib/event-creation-job-policy';

export const runtime = 'nodejs';
export const maxDuration = 300;

const formats: Record<string, string> = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

async function readBounded(request: NextRequest) {
  const body = request.body?.getReader();
  if (!body) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await body.read();
    if (done) return Buffer.concat(chunks, length);
    length += value.byteLength;
    if (length > MAX_JOB_IMAGE_BYTES) {
      void body.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
}

export async function GET() {
  const ownerId = await jobOwnerId();
  const jobs = ownerId === null ? [] : await prisma.eventCreationJob.findMany({
    where: { ownerId, createdAt: { gt: new Date(Date.now() - JOB_HISTORY_TTL_MS) } },
    orderBy: { createdAt: 'desc' }, take: 20, select: { id: true },
  });
  return jobResponse({ jobs });
}

export async function POST(request: NextRequest) {
  const started = performance.now();
  const id = request.headers.get('idempotency-key') ?? '';
  const secret = request.headers.get('x-event-job-secret') ?? '';
  const mimeType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!validJobId(id) || !validJobSecret(secret)) return jobResponse({ error: 'Richiesta non valida.' }, 400);
  if (!Object.hasOwn(formats, mimeType)) return jobResponse({ error: 'Usa una locandina JPEG, PNG, GIF o WebP.' }, 415);
  if (Number(request.headers.get('content-length')) > MAX_JOB_IMAGE_BYTES) {
    return jobResponse({ error: 'La pubblicazione in background accetta immagini fino a 4 MB. Puoi usare la revisione manuale.' }, 413);
  }
  try {
    const ownerId = await jobOwnerId();
    const bytes = await readBounded(request);
    if (!bytes) return jobResponse({ error: 'Immagine troppo grande per la pubblicazione in background.' }, 413);
    const image = await sharp(bytes, { limitInputPixels: 16_000_000 }).metadata().catch(() => null);
    if (!image || image.format !== formats[mimeType] || !image.width || !image.height ||
        Math.min(image.width, image.height) < 32 || Math.max(image.width, image.height) > 4000 || (image.pages ?? 1) > 1) {
      return jobResponse({ error: 'Locandina non valida: usa un’immagine statica fra 32 e 4000 pixel per lato.' }, 422);
    }
    const now = new Date();
    const inputHash = jobHash(bytes);
    const ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() || 'unknown';
    const quotaKey = ownerId === null
      ? createHmac('sha256', process.env.NEXTAUTH_SECRET_KEY || 'local-creation-quota').update(ip).digest('hex')
      : `account:${ownerId}`;
    const result = await prisma.$transaction(async tx => {
      // Serializes admission only, not OCR, crop, duplicate checks or writes of events.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('event-creation-admission')::bigint)`;
      const prior = await tx.eventCreationJob.findUnique({
        where: { id }, select: { ownerId: true, secretHash: true, inputHash: true, status: true },
      });
      if (prior) {
        if (!canReadJob(prior, ownerId, secret)) return { code: 404 };
        if (prior.inputHash !== inputHash) return { code: 409 };
        return { code: 202, status: prior.status };
      }
      const today = { gte: new Date(+now - 86_400_000) };
      const [personal, daily, active] = await Promise.all([
        tx.eventCreationJob.count({ where: { quotaKey, createdAt: today } }),
        tx.eventCreationJob.count({ where: { createdAt: today } }),
        tx.eventCreationJob.count({ where: { status: { in: ['queued', 'processing'] }, inputExpiresAt: { gt: now } } }),
      ]);
      if (personal >= (ownerId === null ? 8 : 20) || daily >= 120 || active >= 24) return { code: 429 };
      await tx.eventCreationJob.create({
        data: {
          id, ownerId, secretHash: ownerId === null ? jobHash(secret) : null, quotaKey, inputHash,
          input: new Uint8Array(bytes), mimeType, inputExpiresAt: new Date(+now + JOB_INPUT_TTL_MS),
        },
        select: { id: true },
      });
      return { code: 202, status: 'queued' };
    });
    if (result.code !== 202) {
      const error = result.code === 429 ? 'Troppe richieste: riprova più tardi o usa la revisione manuale.' : 'Richiesta non disponibile.';
      return jobResponse({ error }, result.code, result.code === 429 ? { 'Retry-After': '60' } : undefined);
    }
    if (result.status === 'queued' || result.status === 'processing') {
      after(async () => {
        try {
          const { kickEventCreationJob } = await import('../../../lib/event-creation-worker');
          await kickEventCreationJob(id);
        } catch {
          console.warn('[event-creation] Avvio differito; interviene il recupero programmato.');
        }
      });
    }
    return jobResponse({ id, status: result.status }, 202, {
      Location: `/api/event-creation-jobs/${id}`,
      'Server-Timing': `enqueue;dur=${(performance.now() - started).toFixed(1)}`,
    });
  } catch (error) {
    console.warn('[event-creation] Registrazione non disponibile', error instanceof Error ? error.message : error);
    return jobResponse({ error: 'Non abbiamo potuto confermare la ricezione. Puoi riprovare con lo stesso file.' }, 503);
  }
}
