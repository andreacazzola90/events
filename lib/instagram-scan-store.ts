import type { Prisma } from '@prisma/client';
import { prisma } from '../app/lib/prisma';
import {
  INSTAGRAM_USERNAME_PATTERN, InstagramScanError, decryptInstagramToken, encryptInstagramToken, fetchInstagramBusinessPosts,
  instagramScanConfigured, readInstagramBody, requireInstagramSameOrigin,
} from './instagram-scan-connection';

export const INSTAGRAM_SOURCE_LIMIT = 20;

export async function lockInstagramConnection(tx: Prisma.TransactionClient, id: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`instagram-scan:${id}`})::bigint)`;
  return tx.instagramScanConnection.findUnique({ where: { id } });
}

/** Compare-and-set on the encrypted token so a fresh reconnection is never marked expired by an older run. */
export async function markInstagramConnectionExpired(connectionId: string, encryptedToken: string) {
  await prisma.instagramScanConnection.updateMany({
    where: { id: connectionId, encryptedToken }, data: { status: 'expired', encryptedToken: null, lastError: 'instagram_token_expired' },
  });
}

export async function getInstagramScanAdminStatus(userId: number) {
  const connection = await prisma.instagramScanConnection.findUnique({
    where: { userId }, select: {
      status: true, username: true, tokenExpiresAt: true, lastError: true, lastRunAt: true,
      lastVisited: true, lastPublished: true, lastDuplicates: true, lastDiscarded: true, lastFailed: true,
      sources: { orderBy: { createdAt: 'asc' }, select: { id: true, username: true, isActive: true, consentedAt: true, lastError: true, lastScannedAt: true } },
    },
  });
  const status = connection?.status || 'disconnected';
  return {
    configured: instagramScanConfigured(), connected: status === 'active', status,
    username: status === 'disconnected' ? null : connection?.username || null,
    tokenExpiresAt: status === 'active' ? connection?.tokenExpiresAt || null : null,
    tokenExpiresSoon: status === 'active' && Boolean(connection?.tokenExpiresAt && connection.tokenExpiresAt.getTime() - Date.now() < 7 * 86_400_000),
    lastError: connection?.lastError || null, lastRunAt: connection?.lastRunAt || null,
    lastRun: connection ? {
      visited: connection.lastVisited, published: connection.lastPublished, duplicates: connection.lastDuplicates,
      discarded: connection.lastDiscarded, failed: connection.lastFailed,
    } : null,
    sources: status === 'disconnected' ? [] : connection?.sources || [],
  };
}

export async function saveInstagramConnection(userId: number, account: { igUserId: string; username: string; token: string; expiresAt: Date }) {
  const encryptedToken = encryptInstagramToken(account.token);
  const data = {
    igUserId: account.igUserId, username: account.username, encryptedToken, tokenExpiresAt: account.expiresAt,
    status: 'active', lastError: null,
  };
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`instagram-scan-owner:${userId}`})::bigint)`;
    await tx.instagramScanConnection.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  });
}

export function normalizeInstagramUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const username = value.trim().replace(/^@/, '').toLowerCase();
  return INSTAGRAM_USERNAME_PATTERN.test(username) ? username : null;
}

export async function mutateInstagramScanAdmin(request: Request, userId: number) {
  requireInstagramSameOrigin(request);
  let body: Record<string, unknown>;
  try { body = JSON.parse((await readInstagramBody(request, 4096)).toString('utf8')); }
  catch (error) { if (error instanceof InstagramScanError) throw error; throw new InstagramScanError('invalid_payload'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InstagramScanError('invalid_payload');
  const current = await prisma.instagramScanConnection.findUnique({ where: { userId } });
  if (body.action === 'disconnect') {
    if (!current) return { connected: false };
    await prisma.$transaction(async tx => {
      await lockInstagramConnection(tx, current.id);
      await tx.instagramScanConnection.update({ where: { id: current.id }, data: { status: 'disconnected', encryptedToken: null, tokenExpiresAt: null, lastError: null } });
      await tx.instagramScanSource.deleteMany({ where: { connectionId: current.id } });
    });
    return { connected: false };
  }
  if (!current) throw new InstagramScanError('instagram_not_connected', 409);
  if (body.action === 'pause-source' || body.action === 'remove-source') {
    if (typeof body.sourceId !== 'string' || body.sourceId.length > 64) throw new InstagramScanError('invalid_source');
    const sourceId = body.sourceId;
    await prisma.$transaction(async tx => {
      await lockInstagramConnection(tx, current.id);
      const source = await tx.instagramScanSource.findFirst({ where: { id: sourceId, connectionId: current.id } });
      if (!source) throw new InstagramScanError('source_not_found', 404);
      if (body.action === 'remove-source') await tx.instagramScanSource.delete({ where: { id: sourceId } });
      else await tx.instagramScanSource.update({ where: { id: sourceId }, data: { isActive: false, consentedAt: null } });
    });
    return { saved: true };
  }
  if (body.action === 'save-source') {
    const username = normalizeInstagramUsername(body.username);
    if (!username || body.consent !== true) throw new InstagramScanError('username_and_consent_required');
    if (current.status !== 'active' || !current.encryptedToken) throw new InstagramScanError('instagram_not_connected', 409);
    const existing = await prisma.instagramScanSource.findUnique({ where: { connectionId_username: { connectionId: current.id, username } } });
    if (!existing && await prisma.instagramScanSource.count({ where: { connectionId: current.id } }) >= INSTAGRAM_SOURCE_LIMIT) throw new InstagramScanError('source_limit', 409);
    try {
      await fetchInstagramBusinessPosts(decryptInstagramToken(current.encryptedToken), current.igUserId, username);
    } catch (error) {
      if (error instanceof InstagramScanError && error.code === 'instagram_token_expired') await markInstagramConnectionExpired(current.id, current.encryptedToken);
      throw error;
    }
    await prisma.$transaction(async tx => {
      const locked = await lockInstagramConnection(tx, current.id);
      if (locked?.status !== 'active' || locked.encryptedToken !== current.encryptedToken) throw new InstagramScanError('connection_changed', 409);
      const data = { isActive: true, consentedAt: new Date(), lastError: null };
      await tx.instagramScanSource.upsert({
        where: { connectionId_username: { connectionId: current.id, username } },
        create: { connectionId: current.id, username, ...data }, update: data,
      });
    });
    return { saved: true };
  }
  throw new InstagramScanError('invalid_action');
}
