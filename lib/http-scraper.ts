// Simple HTTP-based scraper as fallback when Chromium fails
import { NextResponse } from 'next/server';

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

    // Try to extract an image URL from meta tags or img tags
    let imageUrl = null;
    const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    const twitterImageMatch = html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i);
    const firstImgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);

    if (ogImageMatch) {
      imageUrl = ogImageMatch[1];
    } else if (twitterImageMatch) {
      imageUrl = twitterImageMatch[1];
    } else if (firstImgMatch) {
      imageUrl = firstImgMatch[1];
    }

    // Make image URL absolute if it's relative
    if (imageUrl && !imageUrl.startsWith('http')) {
      const baseUrl = new URL(url);
      if (imageUrl.startsWith('/')) {
        imageUrl = `${baseUrl.origin}${imageUrl}`;
      } else {
        imageUrl = `${baseUrl.origin}/${imageUrl}`;
      }
    }

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