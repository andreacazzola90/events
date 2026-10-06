import { extractEventImageFromHtml } from './event-image';

export async function httpScraper(url: string): Promise<{ pageText: string; finalImageUrl: string | null }> {
  console.log('🌐 Using HTTP fallback scraper for:', url);
  
  try {
    // Simple fetch to get the HTML content with AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    
    // Extract text content from HTML (basic extraction)
    const textContent = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '') // Remove styles
      .replace(/<[^>]+>/g, ' ') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    const imageUrl = extractEventImageFromHtml(html, url);

    console.log('✅ HTTP fallback scraping successful');
    return {
      pageText: textContent.substring(0, 8000), // Limit text length
      finalImageUrl: imageUrl
    };

  } catch (error) {
    console.error('❌ HTTP fallback scraping failed:', error);
    throw new Error(`HTTP scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}