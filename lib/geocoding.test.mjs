import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("./geocoding.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadGeocoder(fetchImplementation, signalImplementation = AbortSignal) {
  const loadedModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: loadedModule,
    exports: loadedModule.exports,
    require,
    process,
    fetch: fetchImplementation,
    URLSearchParams,
    AbortSignal: signalImplementation,
  });
  return loadedModule.exports.geocodeLocation;
}

test("uses and caches the municipality center when the best place match belongs elsewhere", async () => {
  const queries = [];
  const geocodeLocation = loadGeocoder(async (url) => {
    const query = new URL(url).searchParams.get("q");
    queries.push(query);
    const result = query === "Centro storico, Schio"
      ? [{ lat: "45.5516938", lon: "11.5434266", address: { city: "Vicenza" } }]
      : [
          { type: "administrative", lat: "45.7233579", lon: "11.3551480", address: { city: "Schio" } },
          { type: "town", lat: "45.7113511", lon: "11.3553593", address: { city: "Schio" } },
        ];
    return { ok: true, json: async () => result };
  });

  const result = await geocodeLocation("Centro storico, Schio");

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    latitude: 45.7113511,
    longitude: 11.3553593,
  });
  assert.deepEqual(queries, ["Centro storico, Schio", "Schio, Vicenza, Italia"]);

  await geocodeLocation("Centro storico, Schio");
  assert.equal(queries.length, 2);
});

test("keeps precise venue coordinates when its returned municipality matches", async () => {
  let requestCount = 0;
  const geocodeLocation = loadGeocoder(async () => {
    requestCount += 1;
    return {
      ok: true,
      json: async () => [{
        lat: "45.7199064",
        lon: "11.4592778",
        address: { town: "Zanè" },
      }],
    };
  });

  const result = await geocodeLocation("Antica Ostaria Fance, Casette, Zane (VI)");

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    latitude: 45.7199064,
    longitude: 11.4592778,
  });
  assert.equal(requestCount, 1);
});

test("shares one bounded budget across venue and locality lookup", async () => {
  const signals = [];
  const budgets = [];
  const geocodeLocation = loadGeocoder(async (_url, options) => {
    signals.push(options.signal);
    return { ok: true, json: async () => [] };
  }, { timeout: milliseconds => { budgets.push(milliseconds); return AbortSignal.timeout(milliseconds); } });
  await geocodeLocation("Teatro, Schio");
  assert.deepEqual(budgets, [5000]);
  assert.equal(signals.length, 2);
  assert.equal(signals[0], signals[1]);
});

test("aborted requests return optional coordinates and can be retried", async () => {
  let requests = 0;
  const geocodeLocation = loadGeocoder(async (_url, options) => {
    requests++;
    options.signal.throwIfAborted();
    throw new Error("Unexpected unbounded request");
  }, { timeout: () => AbortSignal.abort() });
  for (let attempt = 0; attempt < 2; attempt++) {
    const coordinates = await geocodeLocation("Teatro, Schio");
    assert.equal(coordinates.latitude, null);
    assert.equal(coordinates.longitude, null);
  }
  assert.equal(requests, 2);
});