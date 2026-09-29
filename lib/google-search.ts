import axios from 'axios';

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

export function isWebSearchConfigured(): boolean {
  return !!process.env.TAVILY_API_KEY || !!(process.env.GOOGLE_API_KEY && process.env.GOOGLE_CX);
}

async function tavilySearch(query: string, apiKey: string): Promise<SearchResult[]> {
  const response = await axios.post(
    'https://api.tavily.com/search',
    { query, max_results: 5, search_depth: 'basic' },
    { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 15000 },
  );
  return (response.data?.results || []).map((item: any) => ({
    title: item.title,
    link: item.url,
    snippet: item.content,
  }));
}

async function googleCustomSearch(query: string, apiKey: string, cx: string): Promise<SearchResult[]> {
  const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
    params: { key: apiKey, cx, q: query, num: 5 },
    timeout: 15000,
  });
  return (response.data?.items || []).map((item: any) => ({
    title: item.title,
    link: item.link,
    snippet: item.snippet,
  }));
}

/** Web search via Tavily (preferred) or Google Custom Search. Returns [] when unconfigured or on failure. */
export async function webSearch(query: string): Promise<SearchResult[]> {
  const tavilyKey = process.env.TAVILY_API_KEY;
  const googleKey = process.env.GOOGLE_API_KEY;
  const googleCx = process.env.GOOGLE_CX;

  try {
    console.log(`🔍 Web search for: "${query}"`);
    if (tavilyKey) return await tavilySearch(query, tavilyKey);
    if (googleKey && googleCx) return await googleCustomSearch(query, googleKey, googleCx);
    console.warn('⚠️ No web search provider configured (TAVILY_API_KEY or GOOGLE_API_KEY+GOOGLE_CX). Skipping.');
  } catch (error) {
    console.error('❌ Web search failed:', error instanceof Error ? error.message : error);
  }
  return [];
}
