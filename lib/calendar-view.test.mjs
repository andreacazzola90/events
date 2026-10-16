import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarDays, calendarPeriodLabel, calendarToday, moveCalendarDate } from "./calendar-view.ts";

test("mese allineato al lunedi con giorni dei mesi adiacenti e febbraio bisestile", () => {
  const days = calendarDays("2028-02-12", "month");
  assert.equal(days[0], "2028-01-31");
  assert.equal(days[1], "2028-02-01");
  assert.equal(days.filter(Boolean).length, 35);
  assert.equal(days.length % 7, 0);
  assert.ok(days.includes("2028-02-29"));
  assert.equal(days.at(-1), "2028-03-05");
});

test("mese corrente parte dalla settimana di oggi e completa l'ultima riga", () => {
  const today = calendarToday();
  const days = calendarDays(today, "month");
  const monday = new Date(`${today}T00:00:00Z`);
  const offset = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - offset);

  assert.equal(days[0], monday.toISOString().slice(0, 10));
  assert.ok(days.includes(today));
  assert.equal(days.length % 7, 0);
  assert.ok((days.at(-1) || "") > `${today.slice(0, 7)}-31`);
});

test("settimana parte dal lunedi e attraversa mese e anno", () => {
  assert.deepEqual(calendarDays("2027-01-01", "week"), [
    "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03",
  ]);
});

test("tre giorni e giorno mantengono il giorno scelto anche al cambio DST", () => {
  assert.deepEqual(calendarDays("2026-03-28", "threeDays"), ["2026-03-28", "2026-03-29", "2026-03-30"]);
  assert.deepEqual(calendarDays("2026-10-12", "day"), ["2026-10-12"]);
  assert.deepEqual(calendarDays("invalid", "month"), []);
});

test("navigazione usa il passo della vista e gestisce fine mese", () => {
  assert.equal(moveCalendarDate("2026-01-31", "month", 1), "2026-02-28");
  assert.equal(moveCalendarDate("2026-12-31", "threeDays", 1), "2027-01-03");
  assert.equal(moveCalendarDate("2026-10-12", "week", -1), "2026-10-05");
  assert.equal(moveCalendarDate("2026-10-12", "day", 1), "2026-10-13");
  assert.match(calendarPeriodLabel("2026-10-12", "month"), /ottobre 2026/);
});