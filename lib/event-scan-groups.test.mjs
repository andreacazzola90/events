import assert from "node:assert/strict";
import { test } from "node:test";
import { groupEventsByScanOriginAndDate } from "./event-scan-groups.ts";

const event = (id, origin, createdAt) => ({ id, origin, createdAt, date: "2026-10-01" });

test("separa le origini e ordina per giorno di scansione, non per data evento", () => {
  const groups = groupEventsByScanOriginAndDate([
    event(1, "user", "2026-09-25T22:30:00.000Z"),
    event(2, "visitpedemontana", "2026-09-25T10:00:00.000Z"),
    event(3, "user", "2026-09-25T21:30:00.000Z"),
    event(4, "user", "2026-09-26T10:00:00.000Z"),
    event(5, "user", "2026-09-25T22:45:00.000Z"),
  ], false);

  assert.deepEqual(groups.map(({ origin, label }) => [origin, label]), [
    ["user", "Scansionati da me"],
    ["cron", "Scansionati dal cron"],
  ]);
  assert.deepEqual(groups[0].days.map(({ key, events }) => [
    key, events.map(({ id }) => id),
  ]), [
    ["2026-09-26", [4, 5, 1]],
    ["2026-09-25", [3]],
  ]);
  assert.equal(groups[0].days[0].label, "26 settembre 2026");
  assert.deepEqual(groups[1].days[0].events.map(({ id }) => id), [2]);
});

test("non crea sezioni vuote e non attribuisce gli eventi degli utenti all'admin", () => {
  assert.deepEqual(groupEventsByScanOriginAndDate([], false), []);
  assert.deepEqual(
    groupEventsByScanOriginAndDate([event(1, "cron-source", new Date("2026-09-26T12:00:00Z"))], true)
      .map(({ origin }) => origin),
    ["cron"],
  );
  assert.equal(
    groupEventsByScanOriginAndDate([event(2, "user", "2026-09-26T12:00:00Z")], true)[0].label,
    "Scansionati dagli utenti",
  );
});

test("mantiene visibili i timestamp non validi in un gruppo esplicito", () => {
  const [group] = groupEventsByScanOriginAndDate([
    event(1, "user", "invalid"),
    event(2, "user", "2026-09-26T12:00:00Z"),
  ], false);
  assert.deepEqual(group.days.map(({ key }) => key), ["2026-09-26", null]);
  assert.equal(group.days[1].label, "Data di scansione non valida");
  assert.equal(group.days[1].events[0].id, 1);
});
