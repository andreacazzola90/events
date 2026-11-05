import type { EventData } from '../app/types/event';

const fields = ['title', 'description', 'date', 'time', 'location', 'organizer', 'category', 'price'] as const;
type EditableField = typeof fields[number];

export type EventRescanMatch =
  | { status: 'matched'; event: EventData; score: number }
  | { status: 'missing' | 'ambiguous' };

function normalize(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it-IT')
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
    : '';
}

function missing(value: unknown): boolean {
  return !normalize(value) || /^(?:non trovato|non definito ma speriamo gratis)$/.test(normalize(value));
}

function titleScore(current: string, candidate: string): number {
  if (current.length < 6 || candidate.length < 6) return 0;
  if (current === candidate) return 8;
  if (current.includes(candidate) || candidate.includes(current)) {
    const ratio = Math.min(current.length, candidate.length) / Math.max(current.length, candidate.length);
    return ratio >= 0.72 ? 6 : 0;
  }
  const left = new Set(current.split(' ').filter(token => token.length > 2));
  const right = new Set(candidate.split(' ').filter(token => token.length > 2));
  const shared = [...left].filter(token => right.has(token)).length;
  const overlap = shared / Math.max(1, Math.min(left.size, right.size));
  return overlap >= 0.8 && shared >= 2 ? 5 : 0;
}

function scoreMatch(current: EventData, candidate: EventData): number {
  const title = titleScore(normalize(current.title), normalize(candidate.title));
  if (!title) return 0;
  let score = title;
  let corroborated = false;
  for (const field of ['date', 'time', 'location'] as const) {
    const expected = normalize(current[field]);
    const found = normalize(candidate[field]);
    if (!expected || !found || missing(expected) || missing(found)) continue;
    if (expected === found) {
      score += field === 'date' ? 4 : field === 'time' ? 3 : 2;
      corroborated = true;
    } else if (field === 'location' && (expected.includes(found) || found.includes(expected))) {
      score += 1;
      corroborated = true;
    }
    else score -= 2;
  }
  return corroborated && score >= 6 ? score : 0;
}

export function matchRescannedEvent(current: EventData, candidates: EventData[]): EventRescanMatch {
  const ranked = candidates
    .map(event => ({ event, score: scoreMatch(current, event) }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score);
  if (!ranked.length) return { status: 'missing' };
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) return { status: 'ambiguous' };
  return { status: 'matched', ...ranked[0] };
}

export function buildRescanProposal(current: EventData, rescanned: EventData): Partial<Record<EditableField, string>> {
  const proposal: Partial<Record<EditableField, string>> = {};
  for (const field of fields) {
    const value = typeof rescanned[field] === 'string' ? rescanned[field].trim() : '';
    if (!value || missing(value) || normalize(current[field]) === normalize(value)) continue;
    proposal[field] = value.slice(0, field === 'description' ? 5_000 : 500);
  }
  return proposal;
}
