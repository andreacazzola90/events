import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarDays, calendarPeriodLabel, moveCalendarDate } from "./calendar-view.ts";

test("mese allineato al lunedi con settimane complete e febbraio bisestile", () => {
  const days = calendarDays("2028-02-12", "month");
  assert.equal(days[0], null);
  assert.equal(days[1], "2028-02-01");
  assert.equal(days.filter(Boolean).length, 29);
  assert.equal(days.length % 7, 0);
  assert.ok(days.includes("2028-02-29"));
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