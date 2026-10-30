import axios from 'axios';

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  imageUrl?: string;
}

type SearchOptions = { signal?: AbortSignal; throwOnFailure?: boolean };
type Provider = { name: 'brave' | 'tavily' | 'google'; run: (query: string, options?: SearchOptions) => Promise<SearchResult[]> };

const BRAVE_API = 'https://api.search.brave.com/res/v1';
// Brave's free plan allows one request per second; keep calls from one instance spaced out.
const BRAVE_MIN_INTERVAL_MS = 1_100;
let braveNextSlot = 0;

function braveKey() {
  return process.env.BRAVE_SEARCH_API_KEY?.trim() || '';
}

function googleConfig() {
  const key = process.env.GOOGLE_API_SECRET_KEY?.trim();
  const cx = process.env.GOOGLE_CX?.trim();
  return key && cx ? { key, cx } : null;
}

export function isWebSearchConfigured(): boolean {
  return !!braveKey() || !!process.env.TAVILY_API_KEY || !!googleConfig();
}

function stripHtml(value: unknown): string {
  return typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/&(?:amp|quot|#39|lt|gt);/g, entity => (
    { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' } as Record<string, string>)[entity]).trim() : '';
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('Aborted'));
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    const abort = () => { clearTimeout(timer); reject(signal?.reason ?? new Error('Aborted')); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function braveRequest(path: 'web/search' | 'images/search', params: Record<string, string | number>, options?: SearchOptions) {
  for (let attempt = 0; ; attempt++) {
    const now = Date.now();
    const delay = Math.max(0, braveNextSlot - now);
    braveNextSlot = Math.max(now, braveNextSlot) + BRAVE_MIN_INTERVAL_MS;
    if (delay) await wait(delay, options?.signal);
    try {
      const response = await axios.get(`${BRAVE_API}/${path}`, {
        params,
        headers: { Accept: 'application/json', 'X-Subscription-Token': braveKey() },
        timeout: 15_000,
        signal: options?.signal,
      });
      return response.data;
    } catch (error) {
      if (attempt === 0 && axios.isAxiosError(error) && error.response?.status === 429) continue;
      throw error;
    }
  }
}

async function braveSearch(query: string, options?: SearchOptions): Promise<SearchResult[]> {
  const data = await braveRequest('web/search', {
    q: query, count: 8, country: 'IT', search_lang: 'it', ui_lang: 'it-IT', safesearch: 'moderate',
  }, options);
  return (data?.web?.results || []).flatMap((item: any) => typeof item?.url === 'string' ? [{
    title: stripHtml(item.title),
    link: item.url,
    snippet: stripHtml([item.description, ...(Array.isArray(item.extra_snippets) ? item.extra_snippets : [])].filter(Boolean).join(' ')),
    ...(typeof item.thumbnail?.original === 'string' ? { imageUrl: item.thumbnail.original } : {}),
  }] : []);
}

async function braveImageSearch(query: string, options?: SearchOptions): Promise<SearchResult[]> {
  const data = await braveRequest('images/search', {
    q: query, count: 12, country: 'IT', search_lang: 'it', safesearch: 'strict',
  }, options);
  return (data?.results || []).flatMap((item: any) => {
    const imageUrl = item?.properties?.url;
    if (typeof imageUrl !== 'string' || typeof item?.url !== 'string') return [];
    return [{ title: stripHtml(item.title), link: item.url, snippet: stripHtml(item.source), imageUrl }];
  });
}

async function tavilySearch(query: string, options?: SearchOptions): Promise<SearchResult[]> {
  const response = await axios.post(
    'https://api.tavily.com/search',
    { query, max_results: 5, search_depth: 'basic' },
    { headers: { Authorization: `Bearer ${process.env.TAVILY_API_KEY}` }, timeout: 15000, signal: options?.signal },
  );
  return (response.data?.results || []).map((item: any) => ({
    title: item.title,
    link: item.url,
    snippet: item.content,
  }));
}

async function googleCustomSearch(query: string, options?: SearchOptions): Promise<SearchResult[]> {
  const config = googleConfig()!;
  const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
    params: { key: config.key, cx: config.cx, q: query, num: 5 },
    timeout: 15000,
    signal: options?.signal,
  });
  return (response.data?.items || []).map((item: any) => ({
    title: item.title,
    link: item.link,
    snippet: item.snippet,
  }));
}

async function googleImageSearch(query: string, options?: SearchOptions): Promise<SearchResult[]> {
  const config = googleConfig()!;
  const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
    params: { key: config.key, cx: config.cx, q: query, num: 10, searchType: 'image', imgSize: 'large', safe: 'active', gl: 'it', hl: 'it' },
    timeout: 15000,
    signal: options?.signal,
  });
  return (response.data?.items || []).map((item: any) => ({
    title: item.title,
    link: item.image?.contextLink || item.link,
    snippet: item.snippet || '',
    imageUrl: item.link,
  }));
}

function logFailure(kind: string, provider: string, error: unknown) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.error;
    const reason = detail?.details?.find((item: { reason?: string }) => item.reason)?.reason
      || detail?.errors?.[0]?.reason || error.response?.data?.error?.code;
    console.warn(`${kind} failed:`, {
      provider,
      status: error.response?.status ?? null,
      reason: typeof reason === 'string' ? reason : error.code || 'request_failed',
    });
  } else {
    console.warn(`${kind} failed:`, { provider, reason: 'request_failed' });
  }
}

/** Tries each configured provider in order and falls through to the next one when a provider fails. */
async function runProviders(kind: string, query: string, providers: Provider[], options?: SearchOptions): Promise<SearchResult[]> {
  if (!providers.length) {
    console.warn('⚠️ No web search provider configured (BRAVE_SEARCH_API_KEY, TAVILY_API_KEY or GOOGLE_API_SECRET_KEY+GOOGLE_CX). Skipping.');
    if (options?.throwOnFailure) throw new Error(`${kind} unavailable`);
    return [];
  }
  let succeeded = false;
  for (const provider of providers) {
    if (options?.signal?.aborted) break;
    try {
      const results = await provider.run(query, options);
      succeeded = true;
      if (results.length) return results;
    } catch (error) {
      logFailure(kind, provider.name, error);
    }
  }
  if (!succeeded && options?.throwOnFailure) throw new Error(`${kind} unavailable`);
  return [];
}

function pageProviders(): Provider[] {
  return [
    ...(braveKey() ? [{ name: 'brave' as const, run: braveSearch }] : []),
    ...(process.env.TAVILY_API_KEY ? [{ name: 'tavily' as const, run: tavilySearch }] : []),
    ...(googleConfig() ? [{ name: 'google' as const, run: googleCustomSearch }] : []),
  ];
}

/** Web search via Brave, Tavily or Google Custom Search (first working provider wins). */
export async function webSearch(query: string, options?: SearchOptions): Promise<SearchResult[]> {
  console.log(`🔍 Web search for: "${query}"`);
  return runProviders('Web search', query, pageProviders(), options);
}

/** Direct image results for event covers; falls back to page results whose og:image is extracted later. */
export async function webImageSearch(query: string, options?: SearchOptions): Promise<SearchResult[]> {
  console.log(`🔍 Web image search for: "${query}"`);
  return runProviders('Web image search', query, [
    ...(braveKey() ? [{ name: 'brave' as const, run: braveImageSearch }] : []),
    ...(googleConfig() ? [{ name: 'google' as const, run: googleImageSearch }] : []),
    ...pageProviders(),
  ], options);
}
