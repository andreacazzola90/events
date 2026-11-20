import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as calendarIcs from "./calendar-ics.ts";

const source = readFileSync(new URL("./map-event-date-filter.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loadedModule = { exports: {} };

vm.runInNewContext(compiled, {
  module: loadedModule,
  exports: loadedModule.exports,
  require(name) {
    assert.equal(name, "./calendar-ics");
    return calendarIcs;
  },
});

const { mapEventMatchesDateFilter } = loadedModule.exports;
const today = "2026-11-20";

test("upcoming includes today and future events but excludes past and invalid dates", () => {
  assert.equal(mapEventMatchesDateFilter("2026-11-19", "upcoming", today), false);
  assert.equal(mapEventMatchesDateFilter(today, "upcoming", today), true);
  assert.equal(mapEventMatchesDateFilter("2026-11-21", "upcoming", today), true);
  assert.equal(mapEventMatchesDateFilter("not-a-date", "upcoming", today), false);
});

test("today and custom ranges constrain the expanded calendar dataset", () => {
  assert.equal(mapEventMatchesDateFilter(today, "today", today), true);
  assert.equal(mapEventMatchesDateFilter("2026-11-21", "today", today), false);
  assert.equal(mapEventMatchesDateFilter("2026-11-19", "custom", today, today), false);
  assert.equal(mapEventMatchesDateFilter("2026-11-21", "custom", today, today, today), false);
  assert.equal(mapEventMatchesDateFilter(today, "custom", today, today, today), true);
});
