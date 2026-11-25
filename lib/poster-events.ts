import type { EventData } from '../app/types/event';

function dayKey(value: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const local = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!iso && !local) return null;
  const year = Number(iso ? iso[1] : local![3]);
  const month = Number(iso ? iso[2] : local![2]);
  const day = Number(iso ? iso[3] : local![1]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function useful(value?: string): string {
  const text = value?.trim() || '';
  return /^(?:non trovato|non definito|sconosciuto)$/i.test(text) ? '' : text;
}

/** Call only with activities extracted from one verified poster. */
export function groupPosterEventsByDay<T extends EventData>(events: T[], isFromPoster: (event: T) => boolean = () => true): T[] {
  const groups = new Map<string, T[]>();
  for (const event of events) {
    if (!isFromPoster(event)) continue;
    const key = dayKey(event.date || '');
    if (key) groups.set(key, [...(groups.get(key) || []), event]);
  }
  const processed = new Set<string>();
  return events.flatMap(event => {
    if (!isFromPoster(event)) return [event];
    const key = dayKey(event.date || '');
    const group = key && groups.get(key);
    if (!key || !group || group.length === 1) return [event];
    if (processed.has(key)) return [];
    processed.add(key);

    const commonTitles = [...new Set(group.map(item => useful(item.seriesTitle)).filter(Boolean))];
    const titles = [...new Set(group.map(item => useful(item.title)).filter(Boolean))];
    const title = commonTitles.length === 1 ? commonTitles[0] : titles.join(' / ') || event.title;
    const details = group.map(item => {
      const heading = [useful(item.time), useful(item.title), useful(item.location)].filter(Boolean).join(' — ');
      const extra = [useful(item.description), useful(item.organizer), useful(item.price)].filter(Boolean);
      return `- ${[heading, ...extra].filter(Boolean).join(': ')}`;
    });
    return [{ ...event, title, description: `Programma:\n${details.join('\n')}` }];
  });
}

export function posterTextContainsTitle(text: string, title: string): boolean {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const normalizedTitle = normalize(title);
  return normalizedTitle.length >= 5 && normalize(text).includes(normalizedTitle);
}
