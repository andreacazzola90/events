import axios from 'axios';

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

export async function googleSearch(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CX;

  if (!apiKey || !cx) {
    console.warn('⚠️ Google Search API keys missing. Skipping verification.');
    return [];
  }

  try {
    console.log(`🔍 Searching Google for: "${query}"`);
    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: apiKey,
        cx: cx,
        q: query,
        num: 5, // Fetch top 5 results
      },
    });

    if (response.data.items) {
      return response.data.items.map((item: any) => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
      }));
    }

    return [];
  } catch (error) {
    console.error('❌ Google Search failed:', error);
    return [];
  }
}
