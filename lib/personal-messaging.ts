import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type Platform = 'telegram' | 'whatsapp';
export type MessagingCommand = { action: 'status' | 'start' | 'code' | 'password' | 'sources' | 'authorize' | 'pause' | 'disconnect'; platform: Platform; phone?: string; code?: string; password?: string; source?: string; consent?: boolean };
export class MessagingError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status; }
}
export function encryptionKey(value = process.env.PERSONAL_MESSAGING_SESSION_KEY): Buffer {
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) throw new MessagingError('encryption_unavailable', 503);
  return Buffer.from(value, 'hex');
}
export function sealSession(owner: number, platform: Platform, value: string, key = encryptionKey()): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(`personal-messaging:v1:${owner}:${platform}`));
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64');
}
export function openSession(owner: number, platform: Platform, value: string, key = encryptionKey()): string {
  const packed = Buffer.from(value, 'base64');
  const cipher = createDecipheriv('aes-256-gcm', key, packed.subarray(0, 12));
  cipher.setAAD(Buffer.from(`personal-messaging:v1:${owner}:${platform}`));
  cipher.setAuthTag(packed.subarray(12, 28));
  return Buffer.concat([cipher.update(packed.subarray(28)), cipher.final()]).toString('utf8');
}
export function parseMessagingCommand(input: unknown): MessagingCommand {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new MessagingError('invalid_payload');
  const payload = input as Record<string, unknown>;
  const allowed: Record<string, string[]> = { status: [], start: ['phone'], code: ['code'], password: ['password'], sources: [], authorize: ['source', 'consent'], pause: ['source'], disconnect: [] };
  if (typeof payload.action !== 'string' || !Object.hasOwn(allowed, payload.action) || !['telegram', 'whatsapp'].includes(String(payload.platform))) throw new MessagingError('invalid_payload');
  if (Object.keys(payload).some(key => !['action', 'platform', ...allowed[payload.action as string]].includes(key))) throw new MessagingError('invalid_payload');
  for (const field of ['phone', 'code', 'password', 'source']) if (payload[field] !== undefined && (typeof payload[field] !== 'string' || !(payload[field] as string).length || (payload[field] as string).length > (field === 'password' ? 256 : 200))) throw new MessagingError('invalid_payload');
  if (payload.action === 'start' && payload.platform === 'telegram' && !/^\+[1-9]\d{6,14}$/.test(String(payload.phone || ''))) throw new MessagingError('invalid_phone');
  if (payload.platform === 'whatsapp' && payload.phone !== undefined) throw new MessagingError('invalid_payload');
  if ((payload.action === 'code' || payload.action === 'password') && (payload.platform !== 'telegram' || !payload[payload.action])) throw new MessagingError('invalid_payload');
  if (['authorize', 'pause'].includes(payload.action) && !payload.source) throw new MessagingError('invalid_payload');
  if (payload.action === 'authorize' && payload.consent !== true) throw new MessagingError('consent_required');
  return payload as MessagingCommand;
}
export function requireMessagingOrigin(request: Request, expected = process.env.PERSONAL_MESSAGING_ADMIN_ORIGIN || process.env.NEXTAUTH_URL) {
  let origin: string;
  try { if (!expected) throw new Error(); origin = new URL(expected).origin; } catch { throw new MessagingError('invalid_origin', 403); }
  if (request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new MessagingError('invalid_origin', 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new MessagingError('invalid_payload', 415);
}
export async function boundedJson(request: Request | Response, maximum = 4096): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new MessagingError('invalid_payload');
  const chunks: Uint8Array[] = [];
  let size = 0;
  const deadline = Date.now() + 5000;
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const { done, value } = await Promise.race([reader.read(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new MessagingError('worker_unavailable', 503)), Math.max(1, deadline - Date.now()));
      })]).finally(() => clearTimeout(timer));
      if (done) break;
      size += value.length;
      if (size > maximum) { await reader.cancel(); throw new MessagingError('payload_too_large', 413); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) { void reader.cancel().catch(() => {}); if (error instanceof MessagingError) throw error; throw new MessagingError('invalid_payload'); }
}
export function workerConfiguration(env = process.env) {
  const secret = env.PERSONAL_MESSAGING_WORKER_SECRET;
  if (!secret || !/^[a-f0-9]{64,}$/i.test(secret) || !env.PERSONAL_MESSAGING_WORKER_URL) throw new MessagingError('worker_unavailable', 503);
  let url: URL;
  try { url = new URL(env.PERSONAL_MESSAGING_WORKER_URL); } catch { throw new MessagingError('worker_unavailable', 503); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new MessagingError('worker_unavailable', 503);
  return { url, secret };
}
export async function callMessagingWorker(owner: number, command: MessagingCommand) {
  const { url, secret } = workerConfiguration();
  try {
    const response = await fetch(new URL('/command', url), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12000), headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify({ owner, command }), cache: 'no-store' });
    const result = await boundedJson(response, 131072) as Record<string, unknown>;
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('invalid');
    if (!response.ok) throw new MessagingError(safeMessagingError(result.error), response.status >= 400 && response.status <= 599 ? response.status : 503);
    return publicMessagingStatus(result, command.platform);
  } catch (error) { if (error instanceof MessagingError) throw error; throw new MessagingError('worker_unavailable', 503); }
}
export function publicMessagingStatus(result: Record<string, unknown>, platform: Platform) {
  if (result.platform !== platform || !['disconnected', 'connecting', 'code', 'password', 'qr', 'connected', 'restoring', 'expired'].includes(String(result.status)) || !Array.isArray(result.sources)) throw new MessagingError('worker_unavailable', 503);
  const sources = (value: unknown, maximum: number) => {
    if (!Array.isArray(value) || value.length > maximum) throw new MessagingError('worker_unavailable', 503);
    return value.map(item => {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.title !== 'string' || item.id.length > 200 || item.title.length > 200 || item.kind !== (platform === 'telegram' ? 'broadcast' : 'newsletter')) throw new MessagingError('worker_unavailable', 503);
      return { id: item.id, title: item.title, kind: item.kind, reference: typeof item.reference === 'string' && /^@[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(item.reference) ? item.reference : undefined, active: item.active === true, consentedAt: typeof item.consentedAt === 'string' ? item.consentedAt.slice(0, 40) : undefined };
    });
  };
  const qr = typeof result.qr === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(result.qr) && result.qr.length < 65536 && typeof result.qrExpiresAt === 'number' && result.qrExpiresAt > Date.now() && result.qrExpiresAt <= Date.now() + 60000 ? result.qr : undefined;
  return { platform, status: String(result.status), sources: sources(result.sources, 50),
    listing: platform === 'whatsapp' ? 'unsupported' : 'administered-public-only',
    availableSources: result.availableSources === undefined ? undefined : sources(result.availableSources, 100),
    qr, qrExpiresAt: qr ? result.qrExpiresAt : undefined,
    expiresAt: typeof result.expiresAt === 'number' ? result.expiresAt : undefined,
    remoteRemoved: typeof result.remoteRemoved === 'boolean' ? result.remoteRemoved : undefined,
    error: result.error ? safeMessagingError(result.error) : undefined,
  };
}
const safeErrors = new Set(['invalid_payload', 'invalid_phone', 'consent_required', 'encryption_unavailable', 'worker_unavailable', 'provider_unavailable', 'telegram_configuration_missing', 'code_invalid', 'code_expired', 'password_invalid', 'rate_limited', 'login_expired', 'not_connected', 'source_unavailable', 'source_limit', 'operation_cancelled', 'session_corrupt', 'invalid_origin', 'payload_too_large']);
export function safeMessagingError(value: unknown): string { return typeof value === 'string' && safeErrors.has(value) ? value : 'worker_unavailable'; }