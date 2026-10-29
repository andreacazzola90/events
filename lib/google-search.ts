import axios from 'axios';

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  imageUrl?: string;
}

type SearchOptions = { signal?: AbortSignal; throwOnFailure?: boolean };

export function isWebSearchConfigured(): boolean {
  return !!process.env.TAVILY_API_KEY || !!(process.env.GOOGLE_API_SECRET_KEY && process.env.GOOGLE_CX);
}

async function tavilySearch(query: string, apiKey: string, options?: SearchOptions): Promise<SearchResult[]> {
  const response = await axios.post(
    'https://api.tavily.com/search',
    { query, max_results: 5, search_depth: 'basic' },
    { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 15000, signal: options?.signal },
  );
  return (response.data?.results || []).map((item: any) => ({
    title: item.title,
    link: item.url,
    snippet: item.content,
  }));
}

async function googleCustomSearch(query: string, apiKey: string, cx: string, options?: SearchOptions): Promise<SearchResult[]> {
  const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
    params: { key: apiKey, cx, q: query, num: 5 },
    timeout: 15000,
    signal: options?.signal,
  });
  return (response.data?.items || []).map((item: any) => ({
    title: item.title,
    link: item.link,
    snippet: item.snippet,
  }));
}

/** Web search via Tavily (preferred) or Google Custom Search. Returns [] when unconfigured or on failure. */
export async function webSearch(query: string, options?: SearchOptions): Promise<SearchResult[]> {
  const tavilyKey = process.env.TAVILY_API_KEY;
  const googleKey = process.env.GOOGLE_API_SECRET_KEY;
  const googleCx = process.env.GOOGLE_CX;

  try {
    console.log(`🔍 Web search for: "${query}"`);
    if (tavilyKey) return await tavilySearch(query, tavilyKey, options);
    if (googleKey && googleCx) return await googleCustomSearch(query, googleKey, googleCx, options);
    console.warn('⚠️ No web search provider configured (TAVILY_API_KEY or GOOGLE_API_SECRET_KEY+GOOGLE_CX). Skipping.');
  } catch (error) {
    const provider = tavilyKey ? 'tavily' : 'google';
    if (axios.isAxiosError(error)) {
      const detail = error.response?.data?.error;
      const reason = detail?.details?.find((item: { reason?: string }) => item.reason)?.reason
        || detail?.errors?.[0]?.reason;
      console.warn('Web search failed:', {
        provider,
        status: error.response?.status ?? null,
        reason: typeof reason === 'string' ? reason : error.code || 'request_failed',
      });
    } else {
      console.warn('Web search failed:', { provider, reason: 'request_failed' });
    }
    if (options?.throwOnFailure) throw new Error('Web search unavailable');
  }
  return [];
}

/** Prefer direct Google image results for event covers; Tavily remains a page-search fallback. */
export async function webImageSearch(query: string, options?: SearchOptions): Promise<SearchResult[]> {
  const tavilyKey = process.env.TAVILY_API_KEY;
  const googleKey = process.env.GOOGLE_API_SECRET_KEY;
  const googleCx = process.env.GOOGLE_CX;

  if (tavilyKey) return webSearch(query, options);
  if (!googleKey || !googleCx) return webSearch(query, options);

  try {
    console.log(`🔍 Web image search for: "${query}"`);
    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: { key: googleKey, cx: googleCx, q: query, num: 10, searchType: 'image', imgSize: 'large', safe: 'active', gl: 'it', hl: 'it' },
      timeout: 15000,
      signal: options?.signal,
    });
    return (response.data?.items || []).map((item: any) => ({
      title: item.title,
      link: item.image?.contextLink || item.link,
      snippet: item.snippet || '',
      imageUrl: item.link,
    }));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const detail = error.response?.data?.error;
      const reason = detail?.details?.find((item: { reason?: string }) => item.reason)?.reason
        || detail?.errors?.[0]?.reason;
      console.warn('Web image search failed:', {
        provider: 'google',
        status: error.response?.status ?? null,
        reason: typeof reason === 'string' ? reason : error.code || 'request_failed',
      });
    } else {
      console.warn('Web image search failed:', { provider: 'google', reason: 'request_failed' });
    }
    if (options?.throwOnFailure) throw new Error('Web image search unavailable');
    return [];
  }
}
