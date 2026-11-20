import { createHash, timingSafeEqual } from 'node:crypto';

export const MAX_JOB_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_JOB_ATTEMPTS = 3;
export const JOB_LEASE_MS = 6 * 60_000;
export const JOB_INPUT_TTL_MS = 72 * 60 * 60_000;
export const JOB_HISTORY_TTL_MS = 30 * 24 * 60 * 60_000;

export const validJobId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
export const validJobSecret = (secret: string) => /^[0-9a-f]{64}$/.test(secret);
export const jobHash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');

export function canReadJob(
  job: { ownerId: number | null; secretHash: string | null },
  ownerId: number | null,
  secret: string,
) {
  if (job.ownerId !== null) return job.ownerId === ownerId;
  return !!job.secretHash && validJobSecret(secret) &&
    timingSafeEqual(Buffer.from(job.secretHash, 'hex'), Buffer.from(jobHash(secret), 'hex'));
}

export function retryJobAt(attempt: number, now: Date) {
  return new Date(now.getTime() + 60_000 * 4 ** (attempt - 1));
}
