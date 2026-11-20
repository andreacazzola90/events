import { DateTime } from 'luxon';
import { parseEventDate } from './calendar-ics';
import { generateUniqueSlug } from './slug-utils';
import { publicPageMetadata, resolveSeoImage } from './seo-metadata';
import { siteUrl } from './site-url';
import { EVENT_STATUSES, OFFER_AVAILABILITIES, PERFORMER_TYPES } from '../app/types/event';
import { isValidHttpUrl, isValidOfferValidFrom } from './event-seo-fields';

export type EventSeoInput = {
  id: number;
  title: string;
  date: string;
  time?: string | null;
  description?: string | null;
  location?: string | null;
  endDate?: string | null;
  endTime?: string | null;
  address?: string | null;
  performerName?: string | null;
  performerType?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  organizer?: string | null;
  organizerUrl?: string | null;
  price?: string | null;
  offerUrl?: string | null;
  offerAvailability?: string | null;
  offerValidFrom?: string | null;
  eventStatus?: string | null;
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

export function getEventEndDate(date?: string | null, time?: string | null): string | null {
  if (!date) return null;
  return getEventStartDate(date, time);
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
  const organizerUrl = event.organizerUrl?.trim();
  const offerUrl = event.offerUrl?.trim();
  const availability = event.offerAvailability?.trim();
  const validFrom = event.offerValidFrom?.trim();
  const priceOffer = parseEventOffer(event.price);
  const hasOfferDetails = (offerUrl && isValidHttpUrl(offerUrl))
    || (availability && (OFFER_AVAILABILITIES as readonly string[]).includes(availability))
    || (validFrom && isValidOfferValidFrom(validFrom));
  const offers = priceOffer || hasOfferDetails
    ? {
      '@type': 'Offer' as const,
      ...(priceOffer ? { price: priceOffer.price, priceCurrency: priceOffer.priceCurrency } : {}),
      ...(offerUrl && isValidHttpUrl(offerUrl) ? { url: offerUrl } : {}),
      ...(availability && (OFFER_AVAILABILITIES as readonly string[]).includes(availability)
        ? { availability: `https://schema.org/${availability}` }
        : {}),
      ...(validFrom && isValidOfferValidFrom(validFrom) ? { validFrom } : {}),
    }
    : undefined;
  const performerName = meaningfulText(event.performerName);
  const performerType = event.performerType?.trim();
  const performer = performerName && performerType
    && (PERFORMER_TYPES as readonly string[]).includes(performerType)
    ? { '@type': performerType, name: performerName }
    : undefined;
  const status = event.eventStatus == null
    ? 'Scheduled'
    : (EVENT_STATUSES as readonly string[]).includes(event.eventStatus)
      ? event.eventStatus
      : undefined;
  const endDate = event.endDate ? getEventEndDate(event.endDate, event.endTime) : null;
  const address = meaningfulText(event.address);
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
    ...(status ? { eventStatus: `https://schema.org/Event${status}` } : {}),
    ...(endDate ? { endDate } : {}),
    ...(description ? { description } : {}),
    ...(image ? { image: [image] } : {}),
    ...(performer ? { performer } : {}),
    location: {
      '@type': 'Place',
      name: location,
      ...(address ? { address } : {}),
      ...(hasCoordinates ? { geo: { '@type': 'GeoCoordinates', latitude: event.latitude, longitude: event.longitude } } : {}),
    },
    ...(organizer || (organizerUrl && isValidHttpUrl(organizerUrl))
      ? { organizer: { '@type': 'Organization', ...(organizer ? { name: organizer } : {}), ...(organizerUrl && isValidHttpUrl(organizerUrl) ? { url: organizerUrl } : {}) } }
      : {}),
    ...(offers ? { offers, ...(priceOffer?.price === 0 ? { isAccessibleForFree: true } : {}) } : {}),
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