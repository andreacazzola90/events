export type EventImageCandidate = {
  url: string;
  source: 'visitschio-gallery' | 'event-schema' | 'provider-event' | 'og-image' | 'twitter-image' | 'itemprop-image';
};

const SOURCE_PRIORITY: Record<EventImageCandidate['source'], number> = {
  'visitschio-gallery': 6,
  'event-schema': 5,
  'provider-event': 4,
  'og-image': 3,
  'twitter-image': 2,
  'itemprop-image': 1,
};

const GENERIC_IMAGE_PATH = /(?:^|[\/_-])(logo|favicon|sprite|avatar|placeholder|no[-_]?image|default)(?:[\/_.-]|$)/i;

// Kept self-contained so Puppeteer can serialize it into the page.
export function collectVisitSchioGalleryImages(): EventImageCandidate[] {
  if (!/(^|\.)visitschio\.it$/i.test(window.location.hostname)) return [];

  const candidates: EventImageCandidate[] = [];
  const roots: (Document | ShadowRoot)[] = [document];
  for (const root of roots) {
    root.querySelectorAll('*').forEach(element => {
      if (element.shadowRoot) roots.push(element.shadowRoot);
    });
    root.querySelectorAll('dw-gen-gallery-image').forEach(gallery => {
      const galleryRoots: (Element | ShadowRoot)[] = [gallery];
      for (const galleryRoot of galleryRoots) {
        galleryRoot.querySelectorAll('*').forEach(element => {
          if (element.shadowRoot) galleryRoots.push(element.shadowRoot);
        });
        if (galleryRoot === gallery && gallery.shadowRoot) galleryRoots.push(gallery.shadowRoot);
        galleryRoot.querySelectorAll('img').forEach(image => {
          if (image.currentSrc) candidates.push({ url: image.currentSrc, source: 'visitschio-gallery' });
        });
        galleryRoot.querySelectorAll('picture source').forEach(source => {
          const srcset = source.getAttribute('srcset') || '';
          if (/\bdata:/i.test(srcset)) return;
          srcset.split(',').forEach(entry => {
            const url = entry.trim().split(/\s+/)[0];
            if (url) candidates.push({ url, source: 'visitschio-gallery' });
          });
        });
      }
    });
  }
  return candidates;
}

export function normalizeFacebookEventUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 512) return;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !/^(?:(?:www|m|mbasic|web)\.)?facebook\.com$/.test(url.hostname)) return;
    const eventId = url.pathname.match(/^\/events\/(?:[^/]+\/)?(\d{1,30})\/?$/)?.[1];
    if (eventId) return `https://www.facebook.com/events/${eventId}/`;
  } catch {
    return;
  }
}

export function extractEventImageFromHtml(html: string, pageUrl: string): string | null {
  const candidates: { url: string; source: 'og-image' | 'twitter-image' }[] = [];
  const getAttribute = (tag: string, name: string) => {
    const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
    return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
  };

  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (getAttribute(tag, 'property') ?? getAttribute(tag, 'name'))?.toLowerCase();
    const source = key === 'og:image' ? 'og-image' : key === 'twitter:image' ? 'twitter-image' : null;
    const imageUrl = getAttribute(tag, 'content')?.replace(/&(?:amp|#0*38|#x0*26);/gi, '&');
    if (source && imageUrl) candidates.push({ url: imageUrl, source });
  }

  return selectEventImage(candidates, pageUrl);
}

export function selectEventImage(
  candidates: EventImageCandidate[],
  pageUrl: string,
): string | null {
  const normalized = candidates.flatMap((candidate, index) => {
    try {
      const url = new URL(candidate.url, pageUrl);
      if (!['http:', 'https:'].includes(url.protocol) || GENERIC_IMAGE_PATH.test(url.pathname)) {
        return [];
      }
      return [{ url: url.href, priority: SOURCE_PRIORITY[candidate.source], index }];
    } catch {
      return [];
    }
  });

  normalized.sort((first, second) => second.priority - first.priority || first.index - second.index);
  return normalized[0]?.url ?? null;
}