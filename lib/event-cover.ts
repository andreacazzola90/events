import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';
import { isWebSearchConfigured, webImageSearch, webSearch } from './google-search';
import { extractEventImageFromHtml } from './event-image';
import { coverUrl, fetchCoverResource, withCoverAbort } from './event-cover-network';

export const MAX_COVER_BYTES = 4 * 1024 * 1024;
export const MAX_COVER_PIXELS = 16_000_000;
const MAX_BODY_BYTES = 2048;
const MAX_SCRAPED_PAGES = 5;
const TOKEN_TTL_MS = 5 * 60_000;
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };

export type CoverSearchInput = { title: string; date: string; location: string };
export type CoverCandidate = { id: string; title: string; sourceUrl: string; previewUrl: string };
type SearchReply = { candidates: CoverCandidate[]; status: 'completed' | 'not-configured' | 'failed' };
type CoverPayload = { v: 1; imageUrl: string; sourceUrl: string; title: string; exp: number };
type CoverDependencies = {
  configured: typeof isWebSearchConfigured;
  search: typeof webSearch;
  imageSearch?: typeof webImageSearch;
  fetch: typeof fetchCoverResource;
};
const dependencies: CoverDependencies = { configured: isWebSearchConfigured, search: webSearch, imageSearch: webImageSearch, fetch: fetchCoverResource };

const stateKey = Symbol.for('events.safe-event-cover.v1');
type CoverState = {
  secret: Buffer;
  active: number;
  buckets: Map<string, { count: number; until: number }>;
};
const globals = globalThis as typeof globalThis & { [stateKey]?: CoverState };
const state = globals[stateKey] ??= { secret: randomBytes(32), active: 0, buckets: new Map() };

function signature(payload: string): Buffer {
  return createHmac('sha256', process.env.NEXTAUTH_SECRET_KEY || state.secret)
    .update(`event-cover:v1:${payload}`).digest();
}

export function signCoverCandidate(candidate: Omit<CoverPayload, 'v' | 'exp'>, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...candidate, v: 1, exp: now + TOKEN_TTL_MS })).toString('base64url');
  return `${payload}.${signature(payload).toString('base64url')}`;
}

export function verifyCoverCandidate(token: string, now = Date.now()): CoverPayload {
  if (token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid token');
  const [encoded, supplied] = token.split('.');
  const expected = signature(encoded);
  const actual = Buffer.from(supplied, 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('Invalid token');
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as CoverPayload;
  if (payload.v !== 1 || !Number.isSafeInteger(payload.exp) || payload.exp <= now || payload.exp > now + TOKEN_TTL_MS ||
      typeof payload.title !== 'string' || payload.title.length > 160 ||
      typeof payload.imageUrl !== 'string' || typeof payload.sourceUrl !== 'string') throw new Error('Invalid token');
  coverUrl(payload.imageUrl);
  coverUrl(payload.sourceUrl);
  return payload;
}

function sanitizeField(value: string): string {
  return value.normalize('NFKC')
    .replace(/https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|@[\p{L}\p{N}_.]+/giu, ' ')
    .replace(/(?:\+?\d[\s().-]*){7,}/g, value => /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value : ' ')
    .replace(/[^\p{L}\p{N}\s.,/'()-]/gu, ' ')
    .replace(/\s+/g, ' ').trim();
}

export function parseCoverSearchInput(value: unknown): CoverSearchInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid event fields');
  const fields = value as Record<string, unknown>;
  const limits = { title: 160, date: 40, location: 160 };
  if (Object.keys(fields).some(key => !Object.prototype.hasOwnProperty.call(limits, key))) throw new Error('Unexpected event field');
  const result = {} as CoverSearchInput;
  for (const key of ['title', 'date', 'location'] as const) {
    const field = fields[key];
    if (typeof field !== 'string' || field.length > limits[key]) throw new Error('Invalid event field');
    result[key] = sanitizeField(field).slice(0, limits[key]);
  }
  if (result.title.length < 2) throw new Error('Missing event title');
  return result;
}

export async function normalizeCoverImage(bytes: Buffer, signal: AbortSignal): Promise<Buffer> {
  if (!bytes.length || bytes.length > MAX_COVER_BYTES) throw new Error('Image size limit');
  signal.throwIfAborted();
  const image = sharp(bytes, { limitInputPixels: MAX_COVER_PIXELS, failOn: 'warning', sequentialRead: true });
  const metadata = await withCoverAbort(image.metadata(), signal);
  if (!metadata.format || !['jpeg', 'png', 'webp', 'gif', 'avif', 'heif'].includes(metadata.format) ||
      !metadata.width || !metadata.height || metadata.width < 160 || metadata.height < 160 ||
      metadata.width * metadata.height > MAX_COVER_PIXELS || (metadata.pages ?? 1) > 1 ||
      Math.max(metadata.width, metadata.height) / Math.min(metadata.width, metadata.height) > 6) {
    throw new Error('Invalid cover dimensions or format');
  }
  const jpeg = await withCoverAbort(image.rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).timeout({ seconds: 3 }).toBuffer(), signal);
  if (jpeg.length > MAX_COVER_BYTES) throw new Error('Image size limit');
  return jpeg;
}

const TITLE_STOPWORDS = new Set([
  'del', 'della', 'delle', 'dei', 'degli', 'dello', 'dal', 'dalla', 'nel', 'nella', 'con', 'per', 'tra', 'fra', 'sul', 'sulla',
  'gli', 'una', 'uno', 'the', 'and', 'for', 'with', 'evento', 'eventi', 'event', 'edizione', 'presenta', 'presentano',
]);

function relevanceText(value: string): string {
  return ` ${value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
}

function titleTokens(title: string): string[] {
  return [...new Set(relevanceText(title).trim().split(' ').filter(token => token.length >= 3 && !TITLE_STOPWORDS.has(token)))];
}

/** True when the text clearly refers to the event title (not just a similar topic). */
export function mentionsEventTitle(title: string, ...texts: Array<string | undefined>): boolean {
  const haystack = relevanceText(texts.filter(Boolean).map(text => {
    try {
      const url = new URL(text!);
      return `${url.hostname} ${decodeURIComponent(url.pathname)}`;
    } catch {
      return text!;
    }
  }).join(' '));
  const tokens = titleTokens(title);
  if (!tokens.length) {
    const phrase = relevanceText(title).trim();
    return phrase.length >= 2 && haystack.includes(` ${phrase} `);
  }
  const matched = tokens.filter(token => haystack.includes(` ${token} `)).length;
  return tokens.length === 1 ? matched === 1 : matched >= Math.max(2, Math.ceil(tokens.length * 0.75));
}

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const STOCK_HOSTS = /(^|\.)(freepik|magnific|shutterstock|istockphoto|gettyimages|adobe|dreamstime|alamy|depositphotos|123rf|vecteezy|pngtree|canva|unsplash|pexels|pixabay|pinterest|etsy|amazon|ebay|aliexpress|templatemonster|envato)\./i;

function dateVariants(date: string): string[] {
  const match = date.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return [];
  const [, year, mm, dd] = match;
  const day = String(Number(dd));
  const month = Number(mm);
  if (month < 1 || month > 12) return [];
  return [`${day} ${MONTHS[month - 1]}`, `${dd} ${MONTHS[month - 1]}`, `${dd} ${mm} ${year}`, `${day} ${month} ${year}`, `${year} ${mm} ${dd}`]
    .map(value => relevanceText(value).trim());
}

/** True when the text also refers to the event's place or date, so homonymous events elsewhere are discarded. */
export function mentionsEventContext(fields: Pick<CoverSearchInput, 'date' | 'location'>, ...texts: Array<string | undefined>): boolean {
  const places = relevanceText(fields.location).trim().split(' ')
    .filter(token => token.length >= 3 && !TITLE_STOPWORDS.has(token) && !/^\d+$/.test(token) && !['via', 'piazza', 'viale', 'corso'].includes(token));
  const dates = dateVariants(fields.date);
  if (!places.length && !dates.length) return false;
  const haystack = relevanceText(texts.filter(Boolean).map(text => {
    try {
      const url = new URL(text!);
      return `${url.hostname} ${decodeURIComponent(url.pathname)}`;
    } catch {
      return text!;
    }
  }).join(' '));
  // A known place is decisive: the same title on the same day in another city is a different event.
  if (places.length) return places.some(token => haystack.includes(` ${token} `));
  return dates.some(value => haystack.includes(` ${value} `));
}

/** True when the text names only other years, i.e. a past or future edition of the same event. */
export function mentionsOtherEdition(date: string, ...texts: Array<string | undefined>): boolean {
  const year = date.match(/\b(20\d{2})-\d{2}-\d{2}\b/)?.[1];
  if (!year) return false;
  const years = new Set(texts.filter(Boolean).join(' ').match(/(?<![\p{L}\p{N}_])20[0-3]\d(?![\p{L}\p{N}_])/gu) ?? []);
  return years.size > 0 && !years.has(year);
}

function pageText(html: string): string {
  return html.slice(0, 400_000).replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').slice(0, 60_000);
}

function pageHeadline(html: string): string {
  const head = html.slice(0, 200_000);
  const values: string[] = [];
  for (const pattern of [
    /<title[^>]*>([\s\S]*?)<\/title>/i,
    /<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]*content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["'](?:og:title|twitter:title)["']/i,
    /<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]*content=["']([^"']*)["']/i,
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
  ]) {
    const match = head.match(pattern);
    if (match?.[1]) values.push(match[1].replace(/<[^>]+>/g, ' '));
  }
  return values.join(' ').slice(0, 2000);
}

export async function searchEventCovers(
  input: CoverSearchInput,
  signal: AbortSignal,
  providers: CoverDependencies = dependencies,
): Promise<SearchReply> {
  const candidates: CoverCandidate[] = [];
  if (!providers.configured()) return { candidates, status: 'not-configured' };
  const budget = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
  const seenPages = new Set<string>();
  const seenImages = new Set<string>();
  const seenPixels = new Set<string>();
  let failed = false;
  try {
    const fields = parseCoverSearchInput(input);
    // Only images that belong to this very event (e.g. its official poster) are useful, so the query targets the
    // exact title and every result must mention it; generic look-alike pictures are discarded.
    // Without place or date nothing can prove that a picture belongs to this event.
    if (!mentionsEventContext(fields, fields.location, dateVariants(fields.date).join(' '))) return { candidates, status: 'completed' };
    const query = [`"${fields.title}"`, fields.location, 'locandina'].filter(Boolean).join(' ');
    const addCandidate = async (result: Awaited<ReturnType<typeof providers.search>>[number]) => {
      let sourceUrl = coverUrl(result.link).href;
      let image = result.imageUrl;
      if (STOCK_HOSTS.test(new URL(sourceUrl).hostname) || (image && STOCK_HOSTS.test(new URL(image).hostname))) return;
      const resultText = [result.title, result.snippet, sourceUrl, image];
      if (mentionsOtherEdition(fields.date, result.title, sourceUrl)) return;
      let sameTitle = mentionsEventTitle(fields.title, ...resultText);
      let sameContext = mentionsEventContext(fields, ...resultText);
      if (!image || !sameTitle || !sameContext) {
        if (seenPages.has(sourceUrl) || seenPages.size >= MAX_SCRAPED_PAGES) return;
        seenPages.add(sourceUrl);
        const page = await providers.fetch(sourceUrl, { signal: budget, maxBytes: 512 * 1024, kind: 'page' });
        sourceUrl = coverUrl(page.url).href;
        const html = page.bytes.toString('utf8');
        sameTitle ||= mentionsEventTitle(fields.title, pageHeadline(html), sourceUrl);
        sameContext ||= sameTitle && mentionsEventContext(fields, pageText(html), sourceUrl);
        if (!sameTitle || !sameContext || mentionsOtherEdition(fields.date, pageHeadline(html), sourceUrl)) return;
        image ??= extractEventImageFromHtml(html, page.url) ?? undefined;
        if (!image) return;
      }
      const imageUrl = coverUrl(image).href;
      if (seenImages.has(imageUrl)) return;
      seenImages.add(imageUrl);
      const bitmap = await providers.fetch(imageUrl, { signal: budget, maxBytes: MAX_COVER_BYTES, kind: 'image' });
      const jpeg = await normalizeCoverImage(bitmap.bytes, budget);
      const hash = createHash('sha256').update(jpeg).digest('hex');
      if (seenPixels.has(hash)) return;
      seenPixels.add(hash);
      const candidate = { imageUrl: bitmap.url, sourceUrl, title: fields.title };
      const token = signCoverCandidate(candidate);
      candidates.push({ id: hash.slice(0, 24), title: candidate.title, sourceUrl: candidate.sourceUrl,
        previewUrl: `/api/event-cover-image?token=${token}` });
    };
    // Direct image results first; when none of them can be downloaded, fall back to og:image of web pages.
    const searches = providers.imageSearch ? [providers.imageSearch, providers.search] : [providers.search];
    for (const [searchIndex, search] of searches.entries()) {
      if (candidates.length) break;
      let results: Awaited<ReturnType<typeof search>>;
      try {
        results = await withCoverAbort(search(query, { signal: budget, throwOnFailure: true }), budget);
      } catch (error) {
        if (searchIndex < searches.length - 1 && !budget.aborted) continue;
        throw error;
      }
      for (const result of results.slice(0, 8)) {
        budget.throwIfAborted();
        if (candidates.length >= 6) break;
        try {
          await addCandidate(result);
        } catch {
          failed = true;
        }
      }
    }
    budget.throwIfAborted();
  } catch {
    failed = true;
  }
  return { candidates, status: failed && !candidates.length ? 'failed' : 'completed' };
}

function acquireCoverRequest(request: Request, kind: 'search' | 'image'): (() => void) | null {
  const now = Date.now();
  for (const [key, entry] of state.buckets) if (entry.until <= now) state.buckets.delete(key);
  const client = (request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').slice(0, 80);
  const keys = [`${kind}:all`, `${kind}:${client}`];
  const limits = kind === 'search' ? [60, 8] : [180, 30];
  if (state.active >= 4 || state.buckets.size >= 256 || keys.some((key, index) => (state.buckets.get(key)?.count ?? 0) >= limits[index])) return null;
  keys.forEach(key => {
    const bucket = state.buckets.get(key) ?? { count: 0, until: now + 60_000 };
    bucket.count++;
    state.buckets.set(key, bucket);
  });
  state.active++;
  return () => { state.active--; };
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return request.headers.get('sec-fetch-site') !== 'cross-site' && (!origin || origin === new URL(request.url).origin);
}

async function readSearchBody(request: Request, signal: AbortSignal): Promise<CoverSearchInput> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) throw new Error('Invalid content type');
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new Error('Body too large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await withCoverAbort(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error('Body too large');
      chunks.push(value);
    }
    return parseCoverSearchInput(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function handleCoverSearch(request: Request): Promise<Response> {
  const empty: SearchReply = { candidates: [], status: 'failed' };
  if (!isSameOrigin(request)) return Response.json(empty, { status: 403, headers });
  const release = acquireCoverRequest(request, 'search');
  if (!release) return Response.json(empty, { status: 429, headers: { ...headers, 'Retry-After': '60' } });
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]);
  try {
    let input: CoverSearchInput;
    try { input = await readSearchBody(request, signal); }
    catch { return Response.json(empty, { status: 400, headers }); }
    const result = await searchEventCovers(input, signal);
    return Response.json(result, { headers });
  } catch {
    return Response.json(empty, { headers });
  } finally {
    release();
  }
}

export async function handleCoverImage(request: Request): Promise<Response> {
  const unavailable = () => Response.json({ error: 'Cover unavailable' }, { status: 404, headers });
  if (!isSameOrigin(request)) return unavailable();
  let payload: CoverPayload;
  try {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => key !== 'token') || params.getAll('token').length !== 1) return unavailable();
    payload = verifyCoverCandidate(params.get('token') ?? '');
  } catch { return unavailable(); }
  const release = acquireCoverRequest(request, 'image');
  if (!release) return Response.json({ error: 'Cover unavailable' }, { status: 429, headers: { ...headers, 'Retry-After': '60' } });
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]);
  try {
    const resource = await fetchCoverResource(payload.imageUrl, { signal, maxBytes: MAX_COVER_BYTES, kind: 'image' });
    const jpeg = await normalizeCoverImage(resource.bytes, signal);
    return new Response(new Uint8Array(jpeg), { headers: { ...headers, 'Content-Type': 'image/jpeg' } });
  } catch { return unavailable(); }
  finally { release(); }
}