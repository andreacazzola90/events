import type { Prisma } from '@prisma/client';
import { prisma } from '../app/lib/prisma';
import { TelegramError, decryptTelegramToken, encryptTelegramToken, newTelegramSecret, readTelegramBody, requireTelegramSameOrigin, telegramApi, telegramSecretHash, telegramSecretMatches, telegramWebhookUrl, verifyTelegramSource } from './telegram-connection';
import type { TelegramBot } from './telegram-connection';

export async function lockTelegramConnection(tx: Prisma.TransactionClient, id: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`telegram:${id}`})::bigint)`;
  return tx.telegramConnection.findUnique({ where: { id } });
}

const emptyMessage = { rawText: null, photoFileId: null, leaseId: null, leasedUntil: null };

export async function getTelegramAdminStatus(userId: number) {
  const connection = await prisma.telegramConnection.findUnique({
    where: { userId }, select: { status: true, botUsername: true, lastError: true, sources: {
      where: { removedAt: null },
      orderBy: { createdAt: 'asc' }, select: {
        id: true, chatId: true, title: true, chatType: true, isActive: true, consentedAt: true,
        verifiedAt: true, lastError: true, lastScannedAt: true,
      },
    } },
  });
  const counts = connection ? await prisma.telegramMessage.groupBy({
    by: ['status'], where: { source: { connection: { userId } } }, _count: true,
    _sum: { publishedCount: true, discardedCount: true },
  }) : [];
  return {
    connected: connection?.status === 'active', status: connection?.status || 'disconnected',
    botUsername: connection?.botUsername || null, lastError: connection?.lastError || null,
    sources: connection?.sources || [],
    counts: Object.fromEntries(counts.map(row => [row.status, row._count])),
    published: counts.reduce((total, row) => total + (row._sum.publishedCount || 0), 0),
    discarded: counts.reduce((total, row) => total + (row._sum.discardedCount || 0), 0),
  };
}

export async function mutateTelegramAdmin(request: Request, userId: number) {
  requireTelegramSameOrigin(request);
  let body: Record<string, unknown>;
  try { body = JSON.parse(Buffer.from(await readTelegramBody(request, 4096)).toString('utf8')); }
  catch (error) { if (error instanceof TelegramError) throw error; throw new TelegramError('invalid_payload'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TelegramError('invalid_payload');
  if (body.action === 'connect') {
    if (typeof body.token !== 'string') throw new TelegramError('invalid_bot_token');
    const encryptedToken = encryptTelegramToken(body.token);
    const id = newTelegramSecret();
    const url = telegramWebhookUrl(id);
    const bot = await telegramApi<TelegramBot>(body.token, 'getMe');
    if (!bot.is_bot || !Number.isSafeInteger(bot.id) || !bot.username) throw new TelegramError('invalid_bot');
    const secret = newTelegramSecret();
    const connection = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`telegram-owner:${userId}`})::bigint)`;
      const current = await tx.telegramConnection.findUnique({ where: { userId } });
      if (current && !['disconnected', 'failed'].includes(current.status)) throw new TelegramError('disconnect_first', 409);
      if (current) await tx.telegramConnection.delete({ where: { id: current.id } });
      return tx.telegramConnection.create({ data: {
        id, userId, botId: String(bot.id), botUsername: bot.username!, encryptedToken,
        webhookSecretHash: telegramSecretHash(secret), status: 'connecting',
      } });
    });
    try {
      const registered = await telegramApi<boolean>(body.token, 'setWebhook', {
        url, secret_token: secret, allowed_updates: ['message', 'channel_post', 'edited_message', 'edited_channel_post'],
        drop_pending_updates: true, max_connections: 4,
      });
      if (registered !== true) throw new TelegramError('telegram_webhook_failed', 502);
      const activated = await prisma.telegramConnection.updateMany({
        where: { id: connection.id, status: 'connecting' }, data: { status: 'active' },
      });
      if (!activated.count) throw new TelegramError('connection_cancelled', 409);
    } catch (error) {
      await prisma.telegramConnection.updateMany({ where: { id: connection.id, status: 'connecting' }, data: {
        status: 'disconnect_unknown', webhookSecretHash: null, lastError: 'telegram_webhook_failed',
      } });
      throw error;
    }
    return { connected: true };
  }
  const current = await prisma.telegramConnection.findUnique({ where: { userId } });
  if (!current) throw new TelegramError('telegram_not_connected', 409);
  if (body.action === 'disconnect') {
    const encrypted = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`telegram-owner:${userId}`})::bigint)`;
      const locked = await lockTelegramConnection(tx, current.id);
      if (!locked || locked.userId !== userId) throw new TelegramError('telegram_not_connected', 409);
      if (['connecting', 'disconnecting'].includes(locked.status)) throw new TelegramError('connection_busy', 409);
      const encrypted = locked.encryptedToken;
      await tx.telegramConnection.update({ where: { id: locked.id }, data: {
        status: 'disconnecting', webhookSecretHash: null, lastError: null,
      } });
      await tx.telegramSource.updateMany({ where: { connectionId: locked.id }, data: { isActive: false, consentedAt: null, revision: { increment: 1 } } });
      await tx.telegramMessage.updateMany({ where: { source: { connectionId: locked.id }, status: { in: ['pending', 'processing'] } }, data: { ...emptyMessage, status: 'skipped', lastError: 'disconnected' } });
      return encrypted;
    });
    let remoteRemoved = !encrypted;
    if (encrypted) {
      try { remoteRemoved = await telegramApi<boolean>(decryptTelegramToken(encrypted), 'deleteWebhook', { drop_pending_updates: true }); }
      catch { remoteRemoved = false; }
    }
    const status = remoteRemoved ? 'disconnected' : 'disconnect_unknown';
    await prisma.telegramConnection.updateMany({ where: { id: current.id, status: 'disconnecting' }, data: {
      status, ...(remoteRemoved ? { encryptedToken: null } : {}), lastError: remoteRemoved ? null : 'telegram_disconnect_unconfirmed',
    } });
    return { connected: false, remoteRemoved, status };
  }
  if (current.status !== 'active' || !current.encryptedToken) throw new TelegramError('telegram_not_connected', 409);
  if (body.action === 'save-source') {
    if (typeof body.chatId !== 'string' || !/^-\d{1,20}$/.test(body.chatId) || body.consent !== true) throw new TelegramError('chat_and_consent_required');
    const chatId = body.chatId;
    const previousSource = await prisma.telegramSource.findUnique({ where: { connectionId_chatId: { connectionId: current.id, chatId } } });
    let verified;
    try { verified = await verifyTelegramSource(decryptTelegramToken(current.encryptedToken), body.chatId); }
    catch (error) {
      const code = error instanceof TelegramError ? error.code : 'telegram_verification_failed';
      if (['telegram_token_revoked', 'telegram_source_forbidden', 'bot_not_member', 'privacy_mode_limited', 'protected_content', 'unsupported_chat'].includes(code)) await prisma.$transaction(async tx => {
        const locked = await lockTelegramConnection(tx, current.id);
        const source = await tx.telegramSource.findUnique({ where: { connectionId_chatId: { connectionId: current.id, chatId } } });
        if (locked?.status !== 'active' || locked.encryptedToken !== current.encryptedToken || locked.webhookSecretHash !== current.webhookSecretHash ||
          source?.id !== previousSource?.id || source?.revision !== previousSource?.revision) return;
        if (code === 'telegram_token_revoked') {
          await tx.telegramConnection.updateMany({ where: { id: current.id }, data: { status: 'revoked', encryptedToken: null, webhookSecretHash: null, lastError: code } });
          await tx.telegramSource.updateMany({ where: { connectionId: current.id }, data: { isActive: false, consentedAt: null, revision: { increment: 1 }, lastError: code } });
          await tx.telegramMessage.updateMany({ where: { source: { connectionId: current.id }, status: { in: ['pending', 'processing'] } }, data: { ...emptyMessage, status: 'failed', lastError: code } });
        } else if (source) {
          await tx.telegramSource.update({ where: { id: source.id }, data: { isActive: false, consentedAt: null, revision: { increment: 1 }, lastError: code } });
          await tx.telegramMessage.updateMany({ where: { sourceId: source.id, status: { in: ['pending', 'processing'] } }, data: { ...emptyMessage, status: 'failed', lastError: code } });
        }
      });
      throw error;
    }
    await prisma.$transaction(async tx => {
      const locked = await lockTelegramConnection(tx, current.id);
      if (locked?.status !== 'active' || locked.encryptedToken !== current.encryptedToken || locked.webhookSecretHash !== current.webhookSecretHash) throw new TelegramError('connection_changed', 409);
      const existing = await tx.telegramSource.findUnique({ where: { connectionId_chatId: { connectionId: current.id, chatId: verified.chatId } } });
      if (verified.chatId !== chatId || existing?.id !== previousSource?.id || existing?.revision !== previousSource?.revision) throw new TelegramError('source_changed', 409);
      if ((!existing || existing.removedAt) && await tx.telegramSource.count({ where: { connectionId: current.id, removedAt: null } }) >= 50) throw new TelegramError('source_limit', 409);
      const data = { title: verified.title, chatType: verified.chatType, publicUsername: verified.username, isActive: true, removedAt: null, consentedAt: new Date(), verifiedAt: new Date(), lastError: null };
      await tx.telegramSource.upsert({ where: { connectionId_chatId: { connectionId: current.id, chatId: verified.chatId } },
        create: { connectionId: current.id, chatId: verified.chatId, ...data }, update: { ...data, revision: { increment: 1 } } });
    });
    return { saved: true };
  }
  if (body.action === 'pause-source' || body.action === 'remove-source') {
    if (typeof body.sourceId !== 'string') throw new TelegramError('invalid_source');
    const sourceId = body.sourceId;
    await prisma.$transaction(async tx => {
      await lockTelegramConnection(tx, current.id);
      const source = await tx.telegramSource.findFirst({ where: { id: sourceId, connectionId: current.id } });
      if (!source) throw new TelegramError('source_not_found', 404);
      await tx.telegramSource.update({ where: { id: sourceId }, data: { isActive: false, consentedAt: null, revision: { increment: 1 } } });
      await tx.telegramMessage.updateMany({ where: { sourceId, status: { in: ['pending', 'processing'] } }, data: { ...emptyMessage, status: 'skipped', lastError: 'source_paused' } });
      if (body.action === 'remove-source') await tx.telegramSource.update({ where: { id: sourceId }, data: { title: 'Fonte rimossa', publicUsername: null, verifiedAt: null, removedAt: new Date(), lastError: 'source_removed' } });
    });
    return { saved: true };
  }
  throw new TelegramError('invalid_action');
}

export function parseTelegramUpdate(payload: unknown) {
  if (!payload || typeof payload !== 'object') throw new TelegramError('invalid_payload');
  const update = payload as Record<string, unknown>;
  if (!Number.isSafeInteger(update.update_id) || Number(update.update_id) < 0) throw new TelegramError('invalid_update');
  const message = (update.message || update.channel_post || update.edited_message || update.edited_channel_post) as Record<string, unknown> | undefined;
  if (!message) return null;
  const chat = message.chat as Record<string, unknown> | undefined;
  if (!chat || !Number.isSafeInteger(chat.id) || !Number.isSafeInteger(message.message_id) || Number(message.message_id) <= 0 || !['group', 'supergroup', 'channel'].includes(String(chat.type))) return null;
  const identity = { chatId: String(chat.id), messageId: Number(message.message_id), updateId: BigInt(Number(update.update_id)) };
  if (message.has_protected_content || message.forward_origin || message.forward_from || message.forward_from_chat ||
    ['video', 'animation', 'document', 'audio', 'voice', 'video_note', 'sticker', 'contact', 'location', 'poll'].some(field => message[field])) {
    return { ...identity, supported: false, rawText: '', photoFileId: undefined };
  }
  if ((message.text !== undefined && typeof message.text !== 'string') || (message.caption !== undefined && typeof message.caption !== 'string')) throw new TelegramError('invalid_message');
  const rawText = [message.text, message.caption].filter(value => typeof value === 'string').join('\n');
  if (rawText.length > 8192) throw new TelegramError('message_too_large', 413);
  const photos = Array.isArray(message.photo) ? message.photo : [];
  if (photos.length > 10) throw new TelegramError('invalid_photo');
  const photo = [...photos].reverse().find(item => item && typeof item.file_id === 'string' && item.file_id.length <= 512 && Number(item.file_size) <= 4 * 1024 * 1024);
  return { ...identity, supported: Boolean(rawText || photo), rawText, photoFileId: photo?.file_id as string | undefined };
}

export async function ingestTelegramUpdate(connectionId: string, secret: string, payload: unknown) {
  const connection = await prisma.telegramConnection.findUnique({ where: { id: connectionId } });
  if (!connection?.webhookSecretHash || !telegramSecretMatches(secret, connection.webhookSecretHash) || connection.status !== 'active') throw new TelegramError('unauthorized', 401);
  const message = parseTelegramUpdate(payload);
  if (!message) return { accepted: false };
  return prisma.$transaction(async tx => {
    const locked = await lockTelegramConnection(tx, connectionId);
    if (locked?.status !== 'active' || !locked.webhookSecretHash || !telegramSecretMatches(secret, locked.webhookSecretHash)) throw new TelegramError('unauthorized', 401);
    const source = await tx.telegramSource.findUnique({ where: { connectionId_chatId: { connectionId, chatId: message.chatId } } });
    if (!source?.isActive || !source.consentedAt || !source.verifiedAt) return { accepted: false };
    const existing = await tx.telegramMessage.findUnique({ where: { sourceId_messageId: { sourceId: source.id, messageId: message.messageId } } });
    if (existing && (existing.updateId >= message.updateId || existing.publishedCount > 0 || existing.status === 'published' || existing.expiresAt <= new Date())) return { accepted: false };
    if (!message.supported && !existing) return { accepted: false };
    const data = { rawText: message.rawText || null, photoFileId: message.photoFileId || null, updateId: message.updateId, status: message.supported ? 'pending' : 'skipped', attempts: 0, nextAttemptAt: new Date(), leaseId: null, leasedUntil: null, lastError: message.supported ? null : 'unsupported_edit' };
    await tx.telegramMessage.upsert({ where: { sourceId_messageId: { sourceId: source.id, messageId: message.messageId } },
      create: { ...data, sourceId: source.id, messageId: message.messageId, expiresAt: new Date(Date.now() + 72 * 3600_000) },
      update: { ...data, version: { increment: 1 } },
    });
    return { accepted: true };
  });
}