import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../app/lib/prisma';
import { createEventWithCalendar } from '../app/lib/google-calendar';

export function normalizeSeriesTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const title = value.normalize('NFKC').trim().replace(/^#{1,6}\s*/, '').replace(/^(\*\*|__)(.*)\1$/, '$2').replace(/\s+/g, ' ').trim();
  if (!title || title.length > 160 || !/[\p{L}\p{N}]/u.test(title) || /^(non trovato|non definito|n\/a|null|undefined)$/i.test(title)) return null;
  return title;
}

function comparable(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export async function createEventWithSeries(data: Prisma.EventUncheckedCreateInput, explicitTitle: unknown) {
  const title = normalizeSeriesTitle(explicitTitle);
  if (!title) return { event: await createEventWithCalendar({ data }), seriesSlug: null };

  const year = /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date.slice(0, 4) : '';
  const owner = data.createdById;
  const canReuse = Number.isSafeInteger(owner) && Number(owner) > 0 && !!data.location.trim() && !!year;
  const scope = JSON.stringify([comparable(title), owner, comparable(data.location), year]);
  const suffix = canReuse ? createHash('sha256').update(scope).digest('hex').slice(0, 20) : randomUUID();
  const prefix = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 110) || 'rassegna';
  const slug = `${prefix}-${suffix}`;

  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async transaction => {
        for (let candidate = 0; candidate < 32; candidate++) {
          const candidateSlug = candidate === 0 ? slug : `${slug}-${candidate + 1}`;
          const existing = await transaction.eventSeries.findUnique({
            where: { slug: candidateSlug },
            include: { events: { select: { createdById: true, location: true, date: true } } },
          });
          const reusable = canReuse && existing?.isPublished && comparable(existing.title) === comparable(title) &&
            existing.events.length > 0 && existing.events.every(event => event.createdById === owner &&
              comparable(event.location) === comparable(data.location) && event.date.startsWith(`${year}-`));
          if (existing && !reusable) continue;
          const series = existing ?? await transaction.eventSeries.create({
            data: { title, slug: candidateSlug, isPublished: true },
          });
          const event = await createEventWithCalendar({ data: { ...data, eventSeriesId: series.id } }, transaction);
          return { event, seriesSlug: series.slug };
        }
        throw new Error('No available series slug in this scope');
      });
    } catch (error) {
      const conflict = error as { code?: string; meta?: { target?: unknown } };
      if (attempt === 0 && conflict.code === 'P2002' && Array.isArray(conflict.meta?.target) && conflict.meta.target.includes('slug')) continue;
      throw error;
    }
  }
}