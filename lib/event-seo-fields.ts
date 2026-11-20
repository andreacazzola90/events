import {
  EVENT_STATUSES,
  OFFER_AVAILABILITIES,
  PERFORMER_TYPES,
  type EventStatus,
  type OfferAvailability,
  type PerformerType,
} from '../app/types/event';

export type EventSeoFieldValues = {
  endDate?: string | null;
  endTime?: string | null;
  address?: string | null;
  performerName?: string | null;
  performerType?: PerformerType | null;
  organizerUrl?: string | null;
  offerUrl?: string | null;
  offerAvailability?: OfferAvailability | null;
  offerValidFrom?: string | null;
  eventStatus?: EventStatus;
};

const OPTIONAL_TEXT_FIELDS = [
  'endDate',
  'endTime',
  'address',
  'performerName',
  'performerType',
  'organizerUrl',
  'offerUrl',
  'offerAvailability',
  'offerValidFrom',
] as const;

const HTTP_URL_FIELDS = ['organizerUrl', 'offerUrl'] as const;

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && !!url.hostname
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

function isValidIsoDate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1) return false;
  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, day);
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function isValidEventTime(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

export function isValidOfferValidFrom(value: string): boolean {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})(?:T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,3}))?)?(Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))?)?$/);
  return !!match && isValidIsoDate(match[1]);
}

export function parseEventSeoFields(input: unknown):
  | { ok: true; fields: EventSeoFieldValues }
  | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Dati SEO non validi.' };
  }

  const record = input as Record<string, unknown>;
  const fields: Record<string, unknown> = {};

  for (const field of OPTIONAL_TEXT_FIELDS) {
    if (!Object.hasOwn(record, field) || record[field] === undefined) continue;
    const value = record[field];
    if (value === null) {
      fields[field] = null;
      continue;
    }
    if (typeof value !== 'string') {
      return { ok: false, error: 'Dati SEO non validi: controlla URL, date e valori selezionati.' };
    }

    const normalized = value.trim();
    if (!normalized) {
      fields[field] = null;
      continue;
    }
    if (HTTP_URL_FIELDS.includes(field as (typeof HTTP_URL_FIELDS)[number]) && !isValidHttpUrl(normalized)) {
      return { ok: false, error: 'Dati SEO non validi: gli URL devono usare HTTP o HTTPS.' };
    }
    if (field === 'endDate' && !isValidIsoDate(normalized)) {
      return { ok: false, error: 'Dati SEO non validi: la data di fine non è valida.' };
    }
    if (field === 'endTime' && !isValidEventTime(normalized)) {
      return { ok: false, error: 'Dati SEO non validi: l’ora di fine non è valida.' };
    }
    if (field === 'performerType' && !(PERFORMER_TYPES as readonly string[]).includes(normalized)) {
      return { ok: false, error: 'Dati SEO non validi: tipo di performer non ammesso.' };
    }
    if (field === 'offerAvailability' && !(OFFER_AVAILABILITIES as readonly string[]).includes(normalized)) {
      return { ok: false, error: 'Dati SEO non validi: disponibilità biglietti non ammessa.' };
    }
    if (field === 'offerValidFrom' && !isValidOfferValidFrom(normalized)) {
      return { ok: false, error: 'Dati SEO non validi: la data di validità dell’offerta non è valida.' };
    }
    fields[field] = normalized;
  }

  if (Object.hasOwn(record, 'eventStatus') && record.eventStatus !== undefined) {
    const value = record.eventStatus;
    if (value === null || (typeof value === 'string' && !value.trim())) {
      fields.eventStatus = 'Scheduled';
    } else if (typeof value !== 'string' || !(EVENT_STATUSES as readonly string[]).includes(value.trim())) {
      return { ok: false, error: 'Dati SEO non validi: stato evento non ammesso.' };
    } else {
      fields.eventStatus = value.trim();
    }
  }

  return { ok: true, fields: fields as EventSeoFieldValues };
}
