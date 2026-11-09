import { extractEventImageFromHtml } from './event-image';
import { fetchCoverResource } from './event-cover-network';
import { FACEBOOK_EVENT_UNAVAILABLE, hasFacebookEventDetails, isFacebookEventSource } from './facebook-event';

const MAX_HTML_BYTES = 2 * 1024 * 1024;

export async function httpScraper(url: string): Promise<{ pageText: string; finalImageUrl: string | null }> {
  console.log('🌐 Using HTTP fallback scraper for:', url);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const resource = await fetchCoverResource(url, {
        signal: controller.signal,
        maxBytes: MAX_HTML_BYTES,
        kind: 'page',
        maxRedirects: 5,
      });
      const html = resource.bytes.toString('utf8');
      const textContent = htmlToEventText(html);
      if ((isFacebookEventSource(url) || isFacebookEventSource(resource.url)) && !hasFacebookEventDetails(textContent)) {
        throw new Error(FACEBOOK_EVENT_UNAVAILABLE);
      }
      const imageUrl = extractEventImageFromHtml(html, resource.url);

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
