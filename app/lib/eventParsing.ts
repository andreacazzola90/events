import { EventData } from '../types/event';

// Regex
export const DATE_REGEX = /(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})|(\d{1,2}\s+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)[a-z]*\.?\s+\d{2,4})/i;
export const TIME_REGEX = /(ore\s+\d{1,2}([:.]\d{2})?)|(\b\d{1,2}[:.]\d{2}\b)/i;

// Category keywords
const CATEGORY_KEYWORDS: Record<string, string> = {
  musica: 'Musica', concerto: 'Musica', dj: 'Musica', band: 'Musica', live: 'Musica',
  calcio: 'Sport', tennis: 'Sport', basket: 'Sport', gara: 'Sport', torneo: 'Sport', corsa: 'Sport',
  mostra: 'Cultura', conferenza: 'Cultura', libro: 'Cultura', presentazione: 'Cultura', arte: 'Cultura',
  teatro: 'Teatro', cabaret: 'Teatro', spettacolo: 'Teatro', commedia: 'Teatro',
  cinema: 'Cinema', film: 'Cinema', proiezione: 'Cinema',
  degustazione: 'Food & Drink', cena: 'Food & Drink', birra: 'Food & Drink', vino: 'Food & Drink', food: 'Food & Drink',
  festa: 'Feste', party: 'Feste', celebration: 'Feste',
  bambini: 'Bambini', family: 'Bambini', famiglie: 'Bambini',
  workshop: 'Workshop', corso: 'Workshop', laboratorio: 'Workshop', seminario: 'Workshop'
};

export function classifyCategory(content: string): string {
  const lower = content.toLowerCase();
  for (const key of Object.keys(CATEGORY_KEYWORDS)) {
    if (lower.includes(key)) return CATEGORY_KEYWORDS[key];
  }
  return 'Altro';
}

export function parseMultipleEvents(rawText: string): EventData[] {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const boundaries: number[] = [0];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const prev = lines[i - 1];
    const hasDate = DATE_REGEX.test(line);
    const prevHasDate = DATE_REGEX.test(prev);
    const isSeparator = /^[\-=_]{4,}$/.test(line);
    const upperTitle = line.length > 4 && line === line.toUpperCase() && !/\d{3,}/.test(line);
    if ((hasDate && prevHasDate) || isSeparator || upperTitle) {
      if (i - boundaries[boundaries.length - 1] > 3) boundaries.push(i);
    }
  }
  const events: EventData[] = [];
  for (let b = 0; b < boundaries.length; b++) {
    const start = boundaries[b];
    const end = b < boundaries.length - 1 ? boundaries[b + 1] : lines.length;
    const slice = lines.slice(start, end);
    const event = parseSingleEvent(slice.join('\n'));
    if (event.title || event.description) events.push(event);
  }
  return events.length ? events : [parseSingleEvent(rawText)];
}

export function parseSingleEvent(text: string): EventData {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const used = new Set<number>();
  const title = lines[0] || '';
  let date = '';
  let time = '';
  let location = '';
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (!date && DATE_REGEX.test(l)) { date = l; used.add(i); continue; }
    if (!time && TIME_REGEX.test(l)) { time = l; used.add(i); continue; }
    if (!location && /(via|piazza|presso|indirizzo|centro|teatro|stadio)/i.test(l)) { location = l; used.add(i); continue; }
  }
  const description = lines.filter((_, idx) => idx !== 0 && !used.has(idx)).join(' ');
  const organizerMatch = description.match(/organizzat[oa] da ([A-Za-zÀ-ÿ0-9 &.'"-]+)/i);
  const organizer = organizerMatch ? organizerMatch[1].trim() : '';
  const priceMatch = description.match(/(€\s?\d{1,3}|\d{1,3}\s?€|ingresso\s+gratuito|gratis)/i);
  const price = priceMatch ? priceMatch[0].replace(/ingresso\s+gratuito|gratis/i, 'Gratis') : '';
  const category = classifyCategory([title, description].join(' '));
  return { title, description, date, time, location, organizer, category, price, rawText: text, imageUrl: undefined };
}
