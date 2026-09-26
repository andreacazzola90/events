import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildEventIcs,
  foldIcsLine,
  normalizeCalendarEmail,
} from "./calendar-ics.ts";

const now = new Date("2026-09-26T10:00:00.000Z");
const base = { id: 42, title: "Concerto", description: "Serata live", location: "Piazza, Schio" };

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
