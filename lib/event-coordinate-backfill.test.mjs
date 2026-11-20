import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./event-coordinate-backfill.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const normalize = value => JSON.parse(JSON.stringify(value));

function loadBackfill() {
  const loadedModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: loadedModule,
    exports: loadedModule.exports,
    Date,
    setTimeout,
  });
  return loadedModule.exports;
}

function event(id, overrides = {}) {
  return {
    id,
    location: `Luogo ${id}, Schio`,
    latitude: null,
    longitude: null,
    updatedAt: new Date(`2026-01-0${id}T00:00:00Z`),
    ...overrides,
  };
}

test('dry-run reads only published candidates and never geocodes or writes', async () => {
  const { backfillEventCoordinates } = loadBackfill();
  const candidates = [event(1), event(2, { latitude: 91, longitude: 11 })];
  const calls = { query: null, geocode: 0, update: 0 };
  const result = await backfillEventCoordinates({
    database: {
      event: {
        findMany: async query => { calls.query = query; return candidates; },
        updateMany: async () => { calls.update++; return { count: 1 }; },
      },
    },
    apply: false,
    geocode: async () => { calls.geocode++; return { latitude: 45, longitude: 11 }; },
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.candidates, 2);
  assert.deepEqual(calls.query.where.isPublished, true);
  assert.deepEqual(normalize(calls.query.where.OR), [
    { latitude: null },
    { longitude: null },
    { latitude: { lt: -90 } },
    { latitude: { gt: 90 } },
    { longitude: { lt: -180 } },
    { longitude: { gt: 180 } },
  ]);
  assert.equal(calls.geocode, 0);
  assert.equal(calls.update, 0);
});

test('apply updates only unchanged published candidates and continues after unresolved results', async () => {
  const { backfillEventCoordinates } = loadBackfill();
  const candidates = [event(1), event(2), event(3)];
  const updates = [];
  const geocoded = [];
  const result = await backfillEventCoordinates({
    database: {
      event: {
        findMany: async () => candidates,
        updateMany: async query => {
          updates.push(query);
          return { count: query.where.id === 1 ? 1 : 0 };
        },
      },
    },
    apply: true,
    geocode: async location => {
      geocoded.push(location);
      if (location.startsWith('Luogo 2')) return { latitude: null, longitude: null };
      return { latitude: 45.7, longitude: 11.3 };
    },
  });

  assert.deepEqual(geocoded, candidates.map(candidate => candidate.location));
  assert.equal(result.resolved, 2);
  assert.equal(result.updated, 1);
  assert.equal(result.unresolved, 1);
  assert.deepEqual(Array.from(result.unresolvedEventIds), [2]);
  assert.equal(result.concurrentChanges, 1);
  assert.deepEqual(normalize(updates[0].where), {
    id: 1,
    isPublished: true,
    location: candidates[0].location,
    updatedAt: candidates[0].updatedAt.toISOString(),
    latitude: null,
    longitude: null,
  });
  assert.deepEqual(normalize(updates[0].data), { latitude: 45.7, longitude: 11.3 });
});

test('preserves valid coordinate components when repairing an incomplete tuple', async () => {
  const { backfillEventCoordinates } = loadBackfill();
  const updates = [];
  const result = await backfillEventCoordinates({
    database: {
      event: {
        findMany: async () => [
          event(1, { latitude: 45.7, longitude: null }),
          event(2, { latitude: 91, longitude: 11.3 }),
        ],
        updateMany: async query => { updates.push(query); return { count: 1 }; },
      },
    },
    apply: true,
    geocode: async () => ({ latitude: 45.8, longitude: 11.4 }),
  });

  assert.equal(result.updated, 2);
  assert.deepEqual(
    updates.map(update => normalize(update.data)),
    [
      { latitude: 45.7, longitude: 11.4 },
      { latitude: 45.8, longitude: 11.3 },
    ],
  );
});

test('clears invalid stored components when a location cannot be geocoded', async () => {
  const { backfillEventCoordinates } = loadBackfill();
  const updates = [];
  const result = await backfillEventCoordinates({
    database: {
      event: {
        findMany: async () => [
          event(1, { latitude: 91, longitude: 11.3 }),
          event(2, { latitude: null, longitude: 200 }),
        ],
        updateMany: async query => { updates.push(query); return { count: 1 }; },
      },
    },
    apply: true,
    geocode: async () => ({ latitude: null, longitude: null }),
  });

  assert.equal(result.clearedInvalid, 2);
  assert.equal(result.unresolved, 2);
  assert.deepEqual(
    updates.map(update => normalize(update.data)),
    [{ latitude: null }, { longitude: null }],
  );
});

test('rejects invalid coordinates and continues after a geocoder failure', async () => {
  const { backfillEventCoordinates } = loadBackfill();
  const updates = [];
  const result = await backfillEventCoordinates({
    database: {
      event: {
        findMany: async () => [event(1), event(2), event(3)],
        updateMany: async query => { updates.push(query); return { count: 1 }; },
      },
    },
    apply: true,
    geocode: async location => {
      if (location.startsWith('Luogo 1')) throw new Error('network');
      if (location.startsWith('Luogo 2')) return { latitude: 91, longitude: 11 };
      return { latitude: 45, longitude: 11 };
    },
  });

  assert.equal(result.updated, 1);
  assert.equal(result.unresolved, 2);
  assert.equal(result.failed, 1);
  assert.deepEqual(Array.from(result.failedEventIds), [1]);
  assert.deepEqual(updates.map(update => update.where.id), [3]);
});

test('reports database failure types without exposing raw error messages', async () => {
  const { backfillEventCoordinates } = loadBackfill();
  const result = await backfillEventCoordinates({
    database: {
      event: {
        findMany: async () => [event(1)],
        updateMany: async () => {
          throw Object.assign(new Error('DATABASE_URL=secret'), { code: 'P2002' });
        },
      },
    },
    apply: true,
    geocode: async () => ({ latitude: 45, longitude: 11 }),
  });

  assert.equal(result.failed, 1);
  assert.deepEqual(normalize(result.failedEventErrors), [
    { eventId: 1, errorType: 'Error', errorCode: 'P2002' },
  ]);
  assert.doesNotMatch(JSON.stringify(result.failedEventErrors), /secret|DATABASE_URL/);
});

test('paces every Nominatim request start by at least one second', async () => {
  const { createNominatimRequestPacer } = loadBackfill();
  let currentTime = 0;
  const sleeps = [];
  const beforeRequest = createNominatimRequestPacer(
    () => currentTime,
    async milliseconds => {
      sleeps.push(milliseconds);
      currentTime += milliseconds;
    },
  );

  await beforeRequest();
  currentTime += 350;
  await beforeRequest();
  await beforeRequest();

  assert.deepEqual(sleeps, [650, 1_000]);
  assert.equal(currentTime, 2_000);
});
