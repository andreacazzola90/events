export type EventImageCandidate = {
  url: string;
  source: 'event-schema' | 'provider-event' | 'og-image' | 'twitter-image' | 'itemprop-image';
};

const SOURCE_PRIORITY: Record<EventImageCandidate['source'], number> = {
  'event-schema': 5,
  'provider-event': 4,
  'og-image': 3,
  'twitter-image': 2,
  'itemprop-image': 1,
};

const GENERIC_IMAGE_PATH = /(?:^|[\/_-])(logo|favicon|sprite|avatar|placeholder|no[-_]?image|default)(?:[\/_.-]|$)/i;

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