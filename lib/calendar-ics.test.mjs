import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildEventIcs,
  buildGoogleCalendarEvent,
  foldIcsLine,
  isUpcomingCalendarEvent,
  normalizeCalendarEmail,
} from "./calendar-ics.ts";
import { getPrimaryLocationToken } from "./slug-utils.ts";
import { normalizeGoogleCalendarEventType } from "./constants.ts";

const now = new Date("2026-09-26T10:00:00.000Z");
const base = { id: 42, title: "Concerto", description: "Serata live", location: "Piazza, Schio" };

test("preferenze accettano solo i tipi nativi Google Calendar creabili", () => {
  for (const type of ["default", "birthday", "focusTime", "outOfOffice", "workingLocation"]) {
    assert.equal(normalizeGoogleCalendarEventType(type), type);
  }
  for (const input of [null, "musica", "fromGmail", ["default"], 1]) {
    assert.equal(normalizeGoogleCalendarEventType(input), null);
  }
});

test("tipi Google di stato usano proprieta obbligatorie senza rifiutare inviti", () => {
  const event = { ...base, date: "2026-12-01", time: "21:00" };
  for (const eventType of ["focusTime", "outOfOffice"]) {
    const payload = buildGoogleCalendarEvent(event, "https://e.it", eventType);
    assert.equal(payload.eventType, eventType);
    assert.equal(payload.transparency, "opaque");
    assert.equal(payload[`${eventType}Properties`].autoDeclineMode, "declineNone");
    assert.equal(buildGoogleCalendarEvent({ ...event, time: "" }, "https://e.it", eventType), null);
  }
  const working = buildGoogleCalendarEvent({ ...event, time: "" }, "https://e.it", "workingLocation");
  assert.equal(working.visibility, "public");
  assert.equal(working.workingLocationProperties.customLocation.label, base.location);
});

test("compleanni Google sono privati, all-day e annuali anche il 29 febbraio", () => {
  const payload = buildGoogleCalendarEvent({ ...base, date: "2028-02-29", time: "21:00" }, "https://e.it", "birthday");
  assert.deepEqual(payload.start, { date: "2028-02-29" });
  assert.deepEqual(payload.end, { date: "2028-03-01" });
  assert.deepEqual(payload.recurrence, ["RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1"]);
  assert.equal(payload.visibility, "private");
  assert.equal(payload.description, undefined);
  assert.equal(payload.extendedProperties, undefined);
});

test("payload Google Calendar mantiene durata reale e fuso durante il cambio DST", () => {
  const payload = buildGoogleCalendarEvent({ ...base, date: "2026-10-25", time: "01:30" }, "https://e.it/events/42");
  assert.equal(payload.start.timeZone, "Europe/Rome");
  assert.equal(new Date(payload.end.dateTime) - new Date(payload.start.dateTime), 120 * 60 * 1000);
  assert.match(payload.start.dateTime, /\+02:00$/);
  assert.match(payload.end.dateTime, /\+01:00$/);
  assert.equal(payload.extendedProperties.private.eventScannerId, "42");
});

test("Google Calendar gestisce giornate intere, date invalide ed eventi conclusi", () => {
  const payload = buildGoogleCalendarEvent({ ...base, date: "31/12/2026", time: "" }, "https://e.it");
  assert.deepEqual(payload.start, { date: "2026-12-31" });
  assert.deepEqual(payload.end, { date: "2027-01-01" });
  assert.equal(buildGoogleCalendarEvent({ ...base, date: "31/02/2026" }, "https://e.it"), null);
  assert.equal(buildGoogleCalendarEvent({ ...base, date: "2026-03-29", time: "02:30" }, "https://e.it"), null);
  assert.equal(isUpcomingCalendarEvent({ ...base, date: "2026-09-25" }, now), false);
  assert.equal(isUpcomingCalendarEvent({ ...base, date: "2026-09-26" }, now), true);
});

test("normalizza e valida l'email calendario", () => {
  assert.deepEqual(normalizeCalendarEmail("  A@X.it "), { ok: true, value: "a@x.it" });
  assert.deepEqual(normalizeCalendarEmail(""), { ok: true, value: null });
  assert.deepEqual(normalizeCalendarEmail(null), { ok: true, value: null });
  assert.equal(normalizeCalendarEmail("foo").ok, false);
  assert.equal(normalizeCalendarEmail("a@b..it").ok, false);
  assert.equal(normalizeCalendarEmail("a@-b.it").ok, false);
  assert.deepEqual(normalizeCalendarEmail("nome.cognome+cal@sub.gmail.com"), { ok: true, value: "nome.cognome+cal@sub.gmail.com" });
  assert.equal(normalizeCalendarEmail(123).ok, false);
  assert.equal(normalizeCalendarEmail(`${"a".repeat(250)}@x.it`).ok, false);
});

test("evento con ora usa TZID Europe/Rome e durata 2h", () => {
  for (const date of ["2026-10-01", "01/10/2026"]) {
    const ics = buildEventIcs({ ...base, date, time: "21:00" }, { now, url: "https://e.it/events/concerto-42" });
    assert.ok(ics);
    assert.match(ics, /DTSTART;TZID=Europe\/Rome:20261001T210000\r\n/);
    assert.match(ics, /DURATION:PT120M\r\n/);
    assert.doesNotMatch(ics, /DTEND/);
    assert.match(ics, /BEGIN:VTIMEZONE/);
    assert.match(ics, /UID:event-42@eventscanner/);
    assert.match(ics, /DTSTAMP:20260926T100000Z/);
    assert.match(ics, /URL:https:\/\/e.it\/events\/concerto-42/);
  }
});

test("accetta data ISO completa e rifiuta suffissi non validi", () => {
  const iso = buildEventIcs({ ...base, date: "2026-10-01T00:00:00.000Z", time: "21:00" }, { now });
  assert.match(iso, /DTSTART;TZID=Europe\/Rome:20261001T210000/);
  assert.equal(buildEventIcs({ ...base, date: "2026-10-01junk", time: "21:00" }, { now }), null);
  const range = buildEventIcs({ ...base, date: "2026-10-01", time: "21.30 - 23:00" }, { now });
  assert.match(range, /DTSTART;TZID=Europe\/Rome:20261001T213000/);
  const bad = buildEventIcs({ ...base, date: "2026-10-01", time: "21:000" }, { now });
  assert.match(bad, /DTSTART;VALUE=DATE:20261001/);
});

test("evento senza ora è all-day", () => {
  for (const time of ["", null, "sera"]) {
    const ics = buildEventIcs({ ...base, date: "2026-10-01", time }, { now });
    assert.match(ics, /DTSTART;VALUE=DATE:20261001\r\n/);
    assert.match(ics, /DTEND;VALUE=DATE:20261002\r\n/);
    assert.doesNotMatch(ics, /VTIMEZONE/);
  }
});

test("data non parsabile restituisce null", () => {
  assert.equal(buildEventIcs({ ...base, date: "prossimo sabato", time: "21:00" }, { now }), null);
  assert.equal(buildEventIcs({ ...base, date: "31/02/2026", time: "21:00" }, { now }), null);
  assert.equal(buildEventIcs({ ...base, date: "", time: "21:00" }, { now }), null);
});

test("esegue l'escaping dei testi e usa CRLF", () => {
  const ics = buildEventIcs(
    { ...base, title: "A; B, C\\D", description: "riga1\nriga2", date: "2026-10-01" },
    { now },
  );
  assert.match(ics, /SUMMARY:A\\; B\\, C\\\\D\r\n/);
  assert.match(ics, /DESCRIPTION:riga1\\nriga2\r\n/);
  assert.match(ics, /LOCATION:Piazza\\, Schio\r\n/);
  assert.equal(ics.replace(/\r\n/g, "").includes("\n"), false);
});

test("piega le righe oltre 75 ottetti senza spezzare caratteri multibyte", () => {
  const folded = foldIcsLine(`SUMMARY:${"è".repeat(100)}`);
  const encoder = new TextEncoder();
  for (const segment of folded.split("\r\n")) {
    assert.ok(encoder.encode(segment).length <= 75);
  }
  assert.equal(folded.split("\r\n ").join(""), `SUMMARY:${"è".repeat(100)}`);
});

test("normalizza il token di località anche quando la location è vuota o nulla", () => {
  assert.equal(getPrimaryLocationToken("Faber Box, Schio, viale Tito Livio, 25"), "Faber Box");
  assert.equal(getPrimaryLocationToken("   "), "");
  assert.equal(getPrimaryLocationToken(null), "");
  assert.equal(getPrimaryLocationToken(undefined), "");
});
