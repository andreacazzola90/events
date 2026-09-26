export type CalendarEventInput = {
  id: number;
  title: string;
  description?: string | null;
  date: string;
  time?: string | null;
  location?: string | null;
};

export type CalendarEmailResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

const EMAIL_REGEX =
  /^[^\s@]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
const MAX_EMAIL_LENGTH = 254;
const DEFAULT_DURATION_MINUTES = 120;
const TIMEZONE = "Europe/Rome";

export function normalizeCalendarEmail(input: unknown): CalendarEmailResult {
  if (input === null || input === undefined) {
    return { ok: true, value: null };
  }
  if (typeof input !== "string") {
    return { ok: false, error: "Email non valida" };
  }
  const value = input.trim().toLowerCase();
  if (!value) {
    return { ok: true, value: null };
  }
  if (value.length > MAX_EMAIL_LENGTH || !EMAIL_REGEX.test(value)) {
    return { ok: false, error: "Inserisci un indirizzo email valido" };
  }
  return { ok: true, value };
}

type DateParts = { year: number; month: number; day: number };

export function parseEventDate(raw: string): DateParts | null {
  const value = (raw || "").trim();
  let match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  let parts: DateParts | null = null;
  if (match) {
    parts = { year: +match[1], month: +match[2], day: +match[3] };
  } else {
    match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      parts = { year: +match[3], month: +match[2], day: +match[1] };
    }
  }
  if (!parts) return null;
  const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    check.getUTCFullYear() !== parts.year ||
    check.getUTCMonth() !== parts.month - 1 ||
    check.getUTCDate() !== parts.day
  ) {
    return null;
  }
  return parts;
}

export function parseEventTime(raw?: string | null): { hour: number; minute: number } | null {
  const match = (raw || "").trim().match(/^(\d{1,2})[:.](\d{2})(?!\d)/);
  if (!match) return null;
  const hour = +match[1];
  const minute = +match[2];
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

const pad = (n: number, len = 2) => String(n).padStart(len, "0");

function formatDate(d: Date) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function formatDateTime(d: Date) {
  return `${formatDate(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

export function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// RFC 5545 §3.1: lines longer than 75 octets must be folded with CRLF + space.
export function foldIcsLine(line: string) {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = chunks.length === 0 ? 75 : 74;
    if (currentBytes + size > limit) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += size;
  }
  chunks.push(current);
  return chunks.join("\r\n ");
}

const VTIMEZONE_EUROPE_ROME = [
  "BEGIN:VTIMEZONE",
  `TZID:${TIMEZONE}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

export function buildEventIcs(
  event: CalendarEventInput,
  options: { url?: string; now?: Date } = {},
): string | null {
  const date = parseEventDate(event.date);
  if (!date) return null;
  const time = parseEventTime(event.time);
  const now = options.now ?? new Date();

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EventScanner//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  let timing: string[];
  if (time) {
    // Wall-clock time stored in UTC fields; the TZID param tells clients it's Rome time.
    const start = new Date(Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute));
    lines.push(...VTIMEZONE_EUROPE_ROME);
    // DURATION (not DTEND) keeps the elapsed length correct across DST changes.
    timing = [
      `DTSTART;TZID=${TIMEZONE}:${formatDateTime(start)}`,
      `DURATION:PT${DEFAULT_DURATION_MINUTES}M`,
    ];
  } else {
    const start = new Date(Date.UTC(date.year, date.month - 1, date.day));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    timing = [
      `DTSTART;VALUE=DATE:${formatDate(start)}`,
      `DTEND;VALUE=DATE:${formatDate(end)}`,
    ];
  }

  const descriptionParts = [event.description?.trim(), options.url].filter(Boolean) as string[];

  lines.push(
    "BEGIN:VEVENT",
    `UID:event-${event.id}@eventscanner`,
    `DTSTAMP:${formatDateTime(now)}Z`,
    ...timing,
    `SUMMARY:${escapeIcsText(event.title || "Evento")}`,
  );
  if (descriptionParts.length > 0) {
    lines.push(`DESCRIPTION:${escapeIcsText(descriptionParts.join("\n\n"))}`);
  }
  if (event.location?.trim()) {
    lines.push(`LOCATION:${escapeIcsText(event.location.trim())}`);
  }
  if (options.url) {
    lines.push(`URL:${options.url}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
