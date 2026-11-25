import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';

type FingerprintClient = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>;

export function posterFingerprint(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function findFingerprintEventIds(client: Pick<FingerprintClient, '$queryRaw'>, fingerprint?: string | null): Promise<number[]> {
  if (process.env.EVENT_POSTER_FINGERPRINT_ENABLED !== 'true' || !fingerprint) return [];
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('Invalid poster fingerprint');
  const rows = await client.$queryRaw<{ eventId: number }[]>`
    SELECT "eventId" FROM "EventPosterFingerprint" WHERE "fingerprint" = ${fingerprint}
  `;
  return rows.map(row => row.eventId);
}

export async function savePosterFingerprint(client: Pick<FingerprintClient, '$executeRaw'>, eventId: number, fingerprint?: string | null): Promise<void> {
  if (process.env.EVENT_POSTER_FINGERPRINT_ENABLED !== 'true' || !fingerprint) return;
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('Invalid poster fingerprint');
  await client.$executeRaw`
    INSERT INTO "EventPosterFingerprint" ("eventId", "fingerprint") VALUES (${eventId}, ${fingerprint})
  `;
}
