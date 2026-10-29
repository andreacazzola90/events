import { prisma } from '../app/lib/prisma';
import type { Prisma } from '@prisma/client';
import type { DuplicateMatch } from '../app/types/event';
import { sameEventStartTime } from './event-display';
import { generateUniqueSlug } from './slug-utils';

export interface DuplicateCandidate {
  title?: string | null;
  date?: string | null;
  time?: string | null;
  sourceUrl?: string | null;
}

export async function lockEventDates(tx: Prisma.TransactionClient, dates: string[]): Promise<void> {
  for (const date of [...new Set(dates.map(value => dateVariants(value)[0] || value))].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`event-publication:${date}`})::bigint)`;
  }
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

/** Same date, similar title, and start time as an existing event. */
export async function findDuplicateEvent(candidate: DuplicateCandidate, client: Pick<Prisma.TransactionClient, 'event'> = prisma): Promise<DuplicateMatch | null> {
  const dates = dateVariants(candidate.date);
  if (dates.length === 0 || !candidate.title?.trim()) return null;

  const sameDay = await client.event.findMany({
    where: { date: { in: dates } },
    select: { id: true, title: true, date: true, time: true, location: true, sourceUrl: true },
  });

  const match = sameDay.find(
    (ev) =>
      titlesMatch(ev.title, candidate.title!) && sameEventStartTime(ev.time, candidate.time),
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
