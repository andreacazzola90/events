import { extractEventImageFromHtml } from './event-image';
import { validatePublicScanUrl } from './pdf-url';

const MAX_HTML_BYTES = 2 * 1024 * 1024;

async function readHtml(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_HTML_BYTES) {
    await response.body?.cancel();
    throw new Error('La pagina della fonte supera il limite consentito.');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_HTML_BYTES) {
        await reader.cancel();
        throw new Error('La pagina della fonte supera il limite consentito.');
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function httpScraper(url: string): Promise<{ pageText: string; finalImageUrl: string | null }> {
  console.log('🌐 Using HTTP fallback scraper for:', url);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      let currentUrl = await validatePublicScanUrl(url);
      let response: Response | undefined;
      for (let redirect = 0; redirect <= 5; redirect++) {
        response = await fetch(currentUrl, {
          redirect: 'manual',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
          },
          signal: controller.signal,
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get('location');
        if (!location || redirect === 5) throw new Error('La fonte ha troppi reindirizzamenti.');
        await response.body?.cancel();
        currentUrl = await validatePublicScanUrl(new URL(location, currentUrl).toString());
      }

      if (!response?.ok) {
        throw new Error(`HTTP ${response?.status}: ${response?.statusText || 'risposta non valida'}`);
      }

      const html = await readHtml(response);
      const textContent = htmlToEventText(html);
      const imageUrl = extractEventImageFromHtml(html, currentUrl.toString());

      console.log('✅ HTTP fallback scraping successful');
      return {
        pageText: textContent.substring(0, 8000),
        finalImageUrl: imageUrl
      };
    } finally {
      clearTimeout(timeoutId);
    }

  } catch (error) {
    console.error('❌ HTTP fallback scraping failed:', error);
    const message = error && typeof error === 'object' && 'message' in error
      ? String(error.message)
      : 'Unknown error';
    throw new Error(`HTTP scraping failed: ${message}`);
  }
}
const NAMED_ENTITIES: Record<string, string> = {
  agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì', ograve: 'ò', ugrave: 'ù', Agrave: 'À', Egrave: 'È', Eacute: 'É',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', hellip: '…', ndash: '–', mdash: '—', euro: '€', deg: '°',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&([a-z]+);/gi, (entity, name: string) => NAMED_ENTITIES[name] ?? entity)
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<(br|\/p|\/div|\/li|\/h\d)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

/** Readable event text from static HTML: metadata and structured data first, then the page body without menus. */
export function htmlToEventText(html: string): string {
  const meta = (name: string) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)`, 'i'))?.[1]
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`, 'i'))?.[1];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const header = [meta('og:title') || title, meta('og:description') || meta('description')]
    .filter(Boolean).map(value => decodeEntities(String(value)).trim());
  const structured = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))
    .map(match => match[1].trim())
    .filter(json => /"@type"\s*:\s*"[^"]*Event"/i.test(json))
    .map(json => `DATI STRUTTURATI: ${json.replace(/\s+/g, ' ').slice(0, 2500)}`);
  const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] || html)
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(header|nav|footer|aside|form)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  return [...header, ...structured, stripTags(body)].filter(Boolean).join('\n\n');
}
