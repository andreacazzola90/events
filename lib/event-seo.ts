import { DateTime } from 'luxon';
import { parseEventDate } from './calendar-ics';
import { generateUniqueSlug } from './slug-utils';
import { publicPageMetadata, resolveSeoImage } from './seo-metadata';
import { siteUrl } from './site-url';

export type EventSeoInput = {
  id: number;
  title: string;
  date: string;
  time?: string | null;
  description?: string | null;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  organizer?: string | null;
  price?: string | null;
  imageUrl?: string | null;
  updatedAt?: Date | string | null;
};

function meaningfulText(value?: string | null): string | undefined {
  const text = value?.trim();
  if (!text || /^(?:n\/?a|n\.?d\.?|non (?:specificat[oa]|disponibile|definit[oa]|indicat[oa]|trovat[oa])|da (?:definire|confermare)|sconosciut[oa]|unknown|tbd|tba|-+)$/i.test(text)) return undefined;
  return text;
}

export function getEventIdFromSlug(slug: string): number | null {
  const match = slug.match(/(?:^|-)([1-9]\d*)$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}

export function getEventPath(event: Pick<EventSeoInput, 'id' | 'title'>): string {
  return `/events/${generateUniqueSlug(event.title, event.id)}`;
}

export function getEventStartDate(date: string, time?: string | null): string | null {
  if (date.includes('T') && !DateTime.fromISO(date.trim(), { setZone: true }).isValid) return null;
  const parts = parseEventDate(date);
  if (!parts) return null;
  const day = DateTime.fromObject(parts, { zone: 'Europe/Rome' });
  if (!day.isValid) return null;
  const dateOnly = day.toISODate();
  const match = time?.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!match) return dateOnly;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return dateOnly;
  const start = DateTime.fromObject({ ...parts, hour, minute }, { zone: 'Europe/Rome' });
  if (!start.isValid || start.hour !== hour || start.minute !== minute || start.getPossibleOffsets().length !== 1) return dateOnly;
  return start.toISO({ suppressMilliseconds: true });
}

export function parseEventOffer(price?: string | null) {
  const text = price?.trim();
  if (!text) return undefined;
  if (/^(?:gratis|gratuito|ingresso (?:libero|gratuito)|entrata (?:libera|gratuita)|free)$/i.test(text)) {
    return { '@type': 'Offer' as const, price: 0, priceCurrency: 'EUR' };
  }
  const match = text.match(/^(?:(?:EUR|\u20ac)\s*(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*(?:EUR|\u20ac))$/i);
  if (!match) return undefined;
  const amount = Number((match[1] ?? match[2]).replace(',', '.'));
  if (!Number.isFinite(amount) || !Number.isSafeInteger(Math.round(amount * 100))) return undefined;
  return { '@type': 'Offer' as const, price: amount, priceCurrency: 'EUR' };
}

export function getEventMetadata(event: EventSeoInput) {
  const description = meaningfulText(event.description)
    ?? [event.title, event.date, meaningfulText(event.location)].filter(Boolean).join(' - ');
  return publicPageMetadata({
    title: event.title,
    description: description.slice(0, 155),
    path: getEventPath(event),
    image: event.imageUrl,
  });
}

export function getEventJsonLd(event: EventSeoInput) {
  const name = meaningfulText(event.title);
  const location = meaningfulText(event.location);
  const startDate = getEventStartDate(event.date, event.time);
  if (!name || !location || !startDate || !Number.isInteger(event.id) || event.id <= 0) return null;
  const description = meaningfulText(event.description);
  const image = resolveSeoImage(event.imageUrl);
  const organizer = meaningfulText(event.organizer);
  const offers = parseEventOffer(event.price);
  const hasCoordinates = typeof event.latitude === 'number' && Number.isFinite(event.latitude)
    && event.latitude >= -90 && event.latitude <= 90
    && typeof event.longitude === 'number' && Number.isFinite(event.longitude)
    && event.longitude >= -180 && event.longitude <= 180;
  const modified = event.updatedAt ? new Date(event.updatedAt) : null;
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name,
    url: siteUrl(getEventPath(event)),
    startDate,
    // Google's documented default; the model has no cancellation/postponement state.
    eventStatus: 'https://schema.org/EventScheduled',
    ...(description ? { description } : {}),
    ...(image ? { image: [image] } : {}),
    location: {
      '@type': 'Place',
      name: location,
      address: location,
      ...(hasCoordinates ? { geo: { '@type': 'GeoCoordinates', latitude: event.latitude, longitude: event.longitude } } : {}),
    },
    ...(organizer ? { organizer: { '@type': 'Organization', name: organizer } } : {}),
    ...(offers ? { offers, ...(offers.price === 0 ? { isAccessibleForFree: true } : {}) } : {}),
    ...(modified && Number.isFinite(modified.getTime()) ? { dateModified: modified.toISOString() } : {}),
  };
}

export function getEventBreadcrumbJsonLd(event: Pick<EventSeoInput, 'id' | 'title'>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl('/') },
      { '@type': 'ListItem', position: 2, name: 'Eventi', item: siteUrl('/eventi') },
      { '@type': 'ListItem', position: 3, name: event.title, item: siteUrl(getEventPath(event)) },
    ],
  };
}