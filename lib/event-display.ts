import type { EventData } from '../app/types/event';

export function getEventStartTime(raw?: string | null): string | null {
  const match = (raw || '').trim().match(/(?:^|[^\d])(\d{1,2})(?:[:.](\d{2}))?(?!\d)/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (hour > 23 || minute > 59) return null;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function sameEventStartTime(first?: string | null, second?: string | null): boolean {
  const firstValue = (first || '').trim();
  const secondValue = (second || '').trim();
  if (!firstValue || !secondValue) return firstValue === secondValue;

  const firstStart = getEventStartTime(firstValue);
  const secondStart = getEventStartTime(secondValue);
  return firstStart && secondStart
    ? firstStart === secondStart
    : firstValue.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() ===
      secondValue.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Keeps each event separate and expands explicit lists of start times. */
export function splitEventsByTime(events: EventData[]): EventData[] {
  if (!Array.isArray(events) || events.length === 0) return events;

  return events.flatMap(event => {
    const time = (event.time || '').trim();
    const slots = time.split(/\s*(?:\/|;|,|\be\b)\s*/i).map(slot => slot.trim()).filter(Boolean);
    const hasMultipleTimes = slots.length > 1 && slots.every(slot =>
      /\b(?:[01]?\d|2[0-3])(?:[:.][0-5]\d)?\b/.test(slot)
    );

    return hasMultipleTimes ? slots.map(slot => ({ ...event, time: slot })) : [event];
  });
}