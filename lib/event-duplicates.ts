import { prisma } from '../app/lib/prisma';
import type { DuplicateMatch } from '../app/types/event';
import { generateUniqueSlug } from './slug-utils';

export interface DuplicateCandidate {
  title?: string | null;
  date?: string | null;
  sourceUrl?: string | null;
}

// Users save DD/MM/YYYY, scrapers save YYYY-MM-DD: match against both.
function dateVariants(raw?: string | null): string[] {
  const value = (raw || '').trim();
  let day: string, month: string, year: string;

  let m = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    [, year, month, day] = m;
  } else if ((m = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) {
    [, day, month, year] = m;
  } else {
    return [];
  }

  const dd = day.padStart(2, '0');
  const mm = month.padStart(2, '0');
  return [`${year}-${mm}-${dd}`, `${dd}/${mm}/${year}`];
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeUrl(value?: string | null): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#]+$/, '');
}

function titlesMatch(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (shorter.length >= 6 && longer.includes(shorter)) return true;

  const tokensA = new Set(na.split(' ').filter((t) => t.length >= 3));
  const tokensB = new Set(nb.split(' ').filter((t) => t.length >= 3));
  if (tokensA.size === 0 || tokensB.size === 0) return false;
  const shared = [...tokensA].filter((t) => tokensB.has(t)).length;
  return shared / new Set([...tokensA, ...tokensB]).size >= 0.6;
}

/** Same date and (similar title or same source URL) as an existing event. */
export async function findDuplicateEvent(candidate: DuplicateCandidate): Promise<DuplicateMatch | null> {
  const dates = dateVariants(candidate.date);
  if (dates.length === 0 || !candidate.title?.trim()) return null;

  const sameDay = await prisma.event.findMany({
    where: { date: { in: dates } },
    select: { id: true, title: true, date: true, time: true, location: true, sourceUrl: true },
  });

  // A bare domain (e.g. an organizer homepage) is shared by many events, so only compare URLs with a path.
  const candidateUrl = normalizeUrl(candidate.sourceUrl);
  const comparableUrl = candidateUrl.includes('/') ? candidateUrl : '';
  const match = sameDay.find(
    (ev) =>
      titlesMatch(ev.title, candidate.title!) ||
      (comparableUrl.length > 0 && normalizeUrl(ev.sourceUrl) === comparableUrl),
  );

  if (!match) return null;
  return {
    id: match.id,
    title: match.title,
    date: match.date,
    time: match.time,
    location: match.location,
    slug: generateUniqueSlug(match.title, match.id),
  };
}
