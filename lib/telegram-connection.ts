import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export class TelegramError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.name = 'TelegramError';
    this.code = code;
    this.status = status;
  }
}

function encryptionKey(): Buffer {
  const value = process.env.TELEGRAM_ENCRYPTION_KEY || '';
  if (!/^[a-fA-F0-9]{64}$/.test(value)) throw new TelegramError('telegram_key_not_configured', 503);
  return Buffer.from(value, 'hex');
}

export function encryptTelegramToken(token: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), nonce);
  cipher.setAAD(Buffer.from('telegram-bot:v1'));
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return ['v1', nonce.toString('hex'), cipher.getAuthTag().toString('hex'), ciphertext.toString('hex')].join('.');
}

export function decryptTelegramToken(value: string): string {
  const key = encryptionKey();
  try {
    const [version, nonce, tag, ciphertext, extra] = value.split('.');
    if (version !== 'v1' || extra || !/^[a-f0-9]{24}$/.test(nonce) || !/^[a-f0-9]{32}$/.test(tag) || !/^(?:[a-f0-9]{2})+$/.test(ciphertext)) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'hex'));
    decipher.setAAD(Buffer.from('telegram-bot:v1'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    throw new TelegramError('telegram_token_unreadable', 503);
  }
}

export const telegramSecretHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const newTelegramSecret = () => randomBytes(32).toString('base64url');

export function redactTelegramTelemetry<Value>(value: Value): Value {
  const visited = new WeakMap<object, unknown>();
  const redact = (item: unknown): unknown => {
    if (typeof item === 'string') return item.replace(/(api\.telegram\.org\/(?:file\/)?bot)[^/\s"'?#]+/gi, '$1[redacted]');
    if (!item || typeof item !== 'object') return item;
    if (visited.has(item)) return visited.get(item);
    const copy: Record<string, unknown> | unknown[] = Array.isArray(item) ? [] : {};
    visited.set(item, copy);
    for (const [key, child] of Object.entries(item)) {
      (copy as Record<string, unknown>)[key] = key.toLowerCase() === 'x-telegram-bot-api-secret-token' ? '[redacted]' : redact(child);
    }
    const record = copy as Record<string, unknown>;
    if (typeof record.url === 'string' && /\/api\/(?:admin\/telegram|telegram\/webhook)(?:[/?#]|$)/.test(record.url)) {
      delete record.data;
      delete record.body;
    }
    return copy;
  };
  return redact(value) as Value;
}

export function telegramSecretMatches(value: string, expectedHash: string): boolean {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value) || !/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  return timingSafeEqual(Buffer.from(telegramSecretHash(value), 'hex'), Buffer.from(expectedHash, 'hex'));
}

export function telegramWebhookUrl(connectionId: string): string {
  try {
    const base = new URL(process.env.TELEGRAM_WEBHOOK_BASE_URL || '');
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/' || base.hostname === 'localhost' || base.hostname === '127.0.0.1') throw new Error();
    return `${base.origin}/api/telegram/webhook?connection=${encodeURIComponent(connectionId)}`;
  } catch {
    throw new TelegramError('telegram_https_not_configured', 503);
  }
}

export function requireTelegramSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  const expected = process.env.TELEGRAM_ADMIN_ORIGIN || process.env.NEXTAUTH_URL;
  try {
    if (!expected || !origin || new URL(expected).origin !== origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new Error();
  } catch {
    throw new TelegramError('same_origin_required', 403);
  }
}

export async function readTelegramBody(request: Request | Response, maximum = 65_536): Promise<Uint8Array> {
  if (Number(request.headers.get('content-length')) > maximum) throw new TelegramError('payload_too_large', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new TelegramError('invalid_payload');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new TelegramError('payload_too_large', 413);
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

type TelegramMethod = 'getMe' | 'setWebhook' | 'deleteWebhook' | 'getChat' | 'getChatMember' | 'getFile';

export async function telegramApi<Result>(token: string, method: TelegramMethod, parameters: Record<string, unknown> = {}, signal?: AbortSignal): Promise<Result> {
  if (!/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(token)) throw new TelegramError('invalid_bot_token');
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', redirect: 'error', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parameters),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000),
    });
    const payload = JSON.parse(Buffer.from(await readTelegramBody(response)).toString('utf8'));
    if (!response.ok || payload.ok !== true) {
      const code = Number(payload.error_code || response.status);
      const failure = code === 401 ? 'telegram_token_revoked' : code === 429 ? 'telegram_rate_limited' :
        code >= 500 ? 'telegram_unavailable' : method === 'getFile' ? 'telegram_file_rejected' :
        code === 403 ? (['getChat', 'getChatMember'].includes(method) ? 'telegram_source_forbidden' : 'telegram_bot_forbidden') : 'telegram_api_rejected';
      throw new TelegramError(failure, code === 401 ? 401 : 502);
    }
    return payload.result as Result;
  } catch (error) {
    if (error instanceof TelegramError) throw error;
    throw new TelegramError('telegram_unavailable', 502);
  }
}

export type TelegramBot = { id: number; is_bot: boolean; username?: string; can_read_all_group_messages?: boolean };
export type TelegramChat = { id: number; type: string; title?: string; username?: string; has_protected_content?: boolean };

export async function verifyTelegramSource(token: string, chatId: string, signal?: AbortSignal) {
  const bot = await telegramApi<TelegramBot>(token, 'getMe', {}, signal);
  const chat = await telegramApi<TelegramChat>(token, 'getChat', { chat_id: chatId }, signal);
  const member = await telegramApi<{ status: string }>(token, 'getChatMember', { chat_id: chat.id, user_id: bot.id }, signal);
  if (!bot.is_bot || !['group', 'supergroup', 'channel'].includes(chat.type)) throw new TelegramError('unsupported_chat');
  if (chat.has_protected_content) throw new TelegramError('protected_content');
  if (!['member', 'administrator', 'creator'].includes(member.status)) throw new TelegramError('bot_not_member');
  if (chat.type !== 'channel' && member.status === 'member' && !bot.can_read_all_group_messages) throw new TelegramError('privacy_mode_limited');
  return { chatId: String(chat.id), title: chat.title?.slice(0, 200) || 'Telegram', username: chat.username || null, chatType: chat.type };
}