import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

export class InstagramScanError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.name = 'InstagramScanError';
    this.code = code;
    this.status = status;
  }
}

export const INSTAGRAM_SCAN_SCOPES = ['instagram_basic', 'pages_show_list', 'pages_read_engagement', 'business_management'] as const;
export const INSTAGRAM_USERNAME_PATTERN = /^[A-Za-z0-9._]{1,30}$/;
export const INSTAGRAM_OAUTH_STATE_COOKIE = 'instagram_scan_oauth_state';
export const INSTAGRAM_OAUTH_CALLBACK_PATH = '/api/admin/instagram-scan/oauth/callback';
const MAX_MEDIA_BYTES = 4 * 1024 * 1024;
const MAX_GRAPH_BYTES = 1024 * 1024;
const GRAPH_TIMEOUT_MS = 10_000;

export function instagramGraphVersion(): string {
  const value = process.env.INSTAGRAM_GRAPH_API_VERSION || '';
  return /^v\d{1,2}\.\d$/.test(value) ? value : 'v22.0';
}

function encryptionKey(): Buffer {
  const value = process.env.INSTAGRAM_SCAN_ENCRYPTION_KEY || '';
  if (!/^[a-fA-F0-9]{64}$/.test(value)) throw new InstagramScanError('instagram_key_not_configured', 503);
  return Buffer.from(value, 'hex');
}

export function encryptInstagramToken(token: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), nonce);
  cipher.setAAD(Buffer.from('instagram-scan:v1'));
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return ['v1', nonce.toString('hex'), cipher.getAuthTag().toString('hex'), ciphertext.toString('hex')].join('.');
}

export function decryptInstagramToken(value: string): string {
  const key = encryptionKey();
  try {
    const [version, nonce, tag, ciphertext, extra] = value.split('.');
    if (version !== 'v1' || extra || !/^[a-f0-9]{24}$/.test(nonce) || !/^[a-f0-9]{32}$/.test(tag) || !/^(?:[a-f0-9]{2})+$/.test(ciphertext)) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'hex'));
    decipher.setAAD(Buffer.from('instagram-scan:v1'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    throw new InstagramScanError('instagram_token_unreadable', 503);
  }
}

/** Trusted application origin from server configuration, never from the Host header. */
export function instagramAppOrigin(): string {
  try {
    const base = new URL(process.env.INSTAGRAM_SCAN_REDIRECT_ORIGIN || process.env.NEXTAUTH_URL || '');
    const local = base.hostname === 'localhost' || base.hostname === '127.0.0.1';
    if ((base.protocol !== 'https:' && !(local && base.protocol === 'http:')) || base.username || base.password) throw new Error();
    return base.origin;
  } catch {
    throw new InstagramScanError('instagram_origin_not_configured', 503);
  }
}

export function instagramAppCredentials() {
  const appId = process.env.INSTAGRAM_APP_ID || '';
  const appSecret = process.env.INSTAGRAM_APP_SECRET || '';
  if (!/^\d{5,25}$/.test(appId) || appSecret.length < 16) throw new InstagramScanError('instagram_not_configured', 503);
  return { appId, appSecret };
}

export function instagramScanConfigured(): boolean {
  try {
    instagramAppCredentials();
    encryptionKey();
    instagramAppOrigin();
    return true;
  } catch {
    return false;
  }
}

export const instagramRedirectUri = () => `${instagramAppOrigin()}${INSTAGRAM_OAUTH_CALLBACK_PATH}`;
export const newInstagramOAuthState = () => randomBytes(32).toString('base64url');

export function instagramOAuthUrl(state: string): string {
  const { appId } = instagramAppCredentials();
  const url = new URL(`https://www.facebook.com/${instagramGraphVersion()}/dialog/oauth`);
  url.search = new URLSearchParams({
    client_id: appId, redirect_uri: instagramRedirectUri(), state, scope: INSTAGRAM_SCAN_SCOPES.join(','), response_type: 'code',
  }).toString();
  return url.toString();
}

export function instagramStateMatches(received: string | null, expected: string | undefined): boolean {
  if (!received || !expected || !/^[A-Za-z0-9_-]{20,128}$/.test(received) || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export function requireInstagramSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  try {
    if (!origin || instagramAppOrigin() !== origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new Error();
  } catch {
    throw new InstagramScanError('same_origin_required', 403);
  }
}

export async function readInstagramBody(body: Request | Response, maximum: number): Promise<Buffer> {
  if (Number(body.headers.get('content-length')) > maximum) throw new InstagramScanError('payload_too_large', 413);
  const reader = body.body?.getReader();
  if (!reader) throw new InstagramScanError('invalid_payload');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new InstagramScanError('payload_too_large', 413);
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

type GraphContext = 'oauth' | 'account' | 'stories' | 'discovery';

/** Maps Graph errors to stable codes; provider messages, tokens and URLs never leave this function. */
function graphFailure(context: GraphContext, httpStatus: number, error: { code?: unknown; error_subcode?: unknown } | undefined): InstagramScanError {
  const code = Number(error?.code);
  if (code === 190 || (context !== 'oauth' && httpStatus === 401)) return new InstagramScanError('instagram_token_expired', 401);
  if ([4, 17, 32, 613].includes(code) || httpStatus === 429) return new InstagramScanError('instagram_rate_limited', 502);
  if (context === 'discovery' && (code === 110 || code === 100)) return new InstagramScanError('instagram_source_not_business', 404);
  if (context === 'oauth') return new InstagramScanError('instagram_oauth_failed', 502);
  if (code === 10 || (code >= 200 && code < 300)) return new InstagramScanError('instagram_permission_denied', 403);
  if (httpStatus >= 500 || code === 1 || code === 2) return new InstagramScanError('instagram_unavailable', 502);
  return new InstagramScanError('instagram_api_rejected', 502);
}

export async function graphRequest<Result>(context: GraphContext, path: string, parameters: Record<string, string>, token: string | null, signal?: AbortSignal): Promise<Result> {
  const url = new URL(`https://graph.facebook.com/${instagramGraphVersion()}/${path}`);
  // OAuth exchanges carry the app secret and codes: send them in a POST body so they never appear in URLs or telemetry.
  const usePost = context === 'oauth';
  if (!usePost) url.search = new URLSearchParams(parameters).toString();
  try {
    const response = await fetch(url, {
      method: usePost ? 'POST' : 'GET', redirect: 'error', cache: 'no-store',
      ...(usePost ? { body: new URLSearchParams(parameters) } : {}),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(GRAPH_TIMEOUT_MS)]) : AbortSignal.timeout(GRAPH_TIMEOUT_MS),
    });
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse((await readInstagramBody(response, MAX_GRAPH_BYTES)).toString('utf8')); } catch { payload = {}; }
    if (!response.ok || payload.error) throw graphFailure(context, response.status, payload.error as { code?: unknown } | undefined);
    return payload as Result;
  } catch (error) {
    if (error instanceof InstagramScanError) throw error;
    throw new InstagramScanError('instagram_unavailable', 502);
  }
}

export async function exchangeInstagramCode(code: string, signal?: AbortSignal): Promise<{ token: string; expiresAt: Date }> {
  if (!/^[A-Za-z0-9_\-#.]{10,1024}$/.test(code)) throw new InstagramScanError('instagram_oauth_failed');
  const { appId, appSecret } = instagramAppCredentials();
  const short = await graphRequest<{ access_token?: unknown }>('oauth', 'oauth/access_token', {
    client_id: appId, client_secret: appSecret, redirect_uri: instagramRedirectUri(), code,
  }, null, signal);
  if (typeof short.access_token !== 'string' || !short.access_token) throw new InstagramScanError('instagram_oauth_failed', 502);
  const long = await graphRequest<{ access_token?: unknown; expires_in?: unknown }>('oauth', 'oauth/access_token', {
    grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: short.access_token,
  }, null, signal);
  if (typeof long.access_token !== 'string' || !long.access_token) throw new InstagramScanError('instagram_oauth_failed', 502);
  const seconds = Number(long.expires_in);
  const expiresAt = new Date(Date.now() + (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 90 * 86_400) : 60 * 86_400) * 1000);
  return { token: long.access_token, expiresAt };
}

export async function findInstagramBusinessAccount(token: string, signal?: AbortSignal): Promise<{ igUserId: string; username: string }> {
  const pages = await graphRequest<{ data?: { instagram_business_account?: { id?: unknown; username?: unknown } }[] }>('account', 'me/accounts', {
    fields: 'instagram_business_account{id,username}', limit: '50',
  }, token, signal);
  for (const page of Array.isArray(pages.data) ? pages.data : []) {
    const account = page?.instagram_business_account;
    if (typeof account?.id === 'string' && /^\d{5,30}$/.test(account.id) && typeof account.username === 'string' && INSTAGRAM_USERNAME_PATTERN.test(account.username)) {
      return { igUserId: account.id, username: account.username };
    }
  }
  throw new InstagramScanError('instagram_business_account_missing', 409);
}

export type InstagramMedia = {
  id: string; kind: 'story' | 'post'; mediaType: string; caption: string; imageUrl: string | null;
  permalink: string | null; timestamp: Date | null;
};

type RawMedia = { id?: unknown; caption?: unknown; media_type?: unknown; media_url?: unknown; thumbnail_url?: unknown; permalink?: unknown; timestamp?: unknown; children?: { data?: RawMedia[] } };

function imageCandidate(media: RawMedia): string | null {
  const mediaType = String(media.media_type || '');
  if (mediaType === 'VIDEO') return typeof media.thumbnail_url === 'string' ? media.thumbnail_url : null;
  if (mediaType === 'CAROUSEL_ALBUM') {
    const children = media.children?.data || [];
    const image = children.find(item => item?.media_type === 'IMAGE' && typeof item.media_url === 'string');
    if (image) return image.media_url as string;
    const video = children.find(item => item?.media_type === 'VIDEO' && typeof item.thumbnail_url === 'string');
    // The album's own media_url mirrors its first child, which may be an mp4: never fall back to it.
    return video ? video.thumbnail_url as string : null;
  }
  return typeof media.media_url === 'string' ? media.media_url : null;
}

function normalizeMedia(media: RawMedia, kind: InstagramMedia['kind']): InstagramMedia | null {
  if (typeof media?.id !== 'string' || !/^\d{1,40}$/.test(media.id)) return null;
  const timestamp = typeof media.timestamp === 'string' ? new Date(media.timestamp) : null;
  const permalink = typeof media.permalink === 'string' && /^https:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._/-]{1,200}$/.test(media.permalink) ? media.permalink : null;
  return {
    id: media.id, kind, mediaType: String(media.media_type || ''),
    caption: kind === 'post' && typeof media.caption === 'string' ? media.caption.slice(0, 8_192) : '',
    imageUrl: imageCandidate(media), permalink,
    timestamp: timestamp && !Number.isNaN(timestamp.getTime()) ? timestamp : null,
  };
}

export async function fetchInstagramStories(token: string, igUserId: string, signal?: AbortSignal): Promise<InstagramMedia[]> {
  if (!/^\d{5,30}$/.test(igUserId)) throw new InstagramScanError('instagram_invalid_account');
  const payload = await graphRequest<{ data?: RawMedia[] }>('stories', `${igUserId}/stories`, {
    fields: 'id,media_type,media_url,thumbnail_url,permalink,timestamp',
  }, token, signal);
  return (Array.isArray(payload.data) ? payload.data : []).map(item => normalizeMedia(item, 'story')).filter((item): item is InstagramMedia => Boolean(item));
}

export async function fetchInstagramBusinessPosts(token: string, igUserId: string, username: string, signal?: AbortSignal): Promise<InstagramMedia[]> {
  if (!/^\d{5,30}$/.test(igUserId)) throw new InstagramScanError('instagram_invalid_account');
  if (!INSTAGRAM_USERNAME_PATTERN.test(username)) throw new InstagramScanError('invalid_username');
  const payload = await graphRequest<{ business_discovery?: { media?: { data?: RawMedia[] } } }>('discovery', igUserId, {
    fields: `business_discovery.username(${username}){username,media.limit(10){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}}}`,
  }, token, signal);
  if (!payload.business_discovery) throw new InstagramScanError('instagram_source_not_business', 404);
  return (payload.business_discovery.media?.data || []).map(item => normalizeMedia(item, 'post')).filter((item): item is InstagramMedia => Boolean(item));
}

export function instagramMediaHostAllowed(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (url.hostname.endsWith('.cdninstagram.com') || url.hostname.endsWith('.fbcdn.net'));
  } catch {
    return false;
  }
}

export async function downloadInstagramMedia(value: string, signal: AbortSignal): Promise<Buffer> {
  if (!instagramMediaHostAllowed(value)) throw new InstagramScanError('instagram_media_rejected');
  try {
    const response = await fetch(value, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]), redirect: 'error', cache: 'no-store',
    });
    if (!response.ok) throw new Error();
    // Lazy import keeps sharp out of the Sentry config that imports the redaction helper.
    const { normalizeCoverImage } = await import('./event-cover');
    return await normalizeCoverImage(await readInstagramBody(response, MAX_MEDIA_BYTES), signal);
  } catch {
    throw new InstagramScanError('instagram_media_unavailable', 502);
  }
}

const secretParameter = /((?:^|[?&#])(?:access_token|client_secret|fb_exchange_token|code|state)=)[^&\s"'#]+/gi;

/** Removes Graph credentials and OAuth codes from telemetry strings without mutating the input. */
export function redactInstagramTelemetry<Value>(value: Value): Value {
  const visited = new WeakMap<object, unknown>();
  const redact = (item: unknown): unknown => {
    if (typeof item === 'string') return item.replace(secretParameter, '$1[redacted]');
    if (!item || typeof item !== 'object') return item;
    if (visited.has(item)) return visited.get(item);
    const copy: Record<string, unknown> | unknown[] = Array.isArray(item) ? [] : {};
    visited.set(item, copy);
    for (const [key, child] of Object.entries(item)) {
      (copy as Record<string, unknown>)[key] = key.toLowerCase() === 'authorization' ? '[redacted]' : redact(child);
    }
    return copy;
  };
  return redact(value) as Value;
}
