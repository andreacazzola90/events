import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('../app/api/events/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function createRoute(options = {}) {
  const callbacks = [];
  const calls = { geo: 0, gallery: 0, cover: 0, cache: 0, warm: 0, calendar: 0, updates: [], creates: [], removed: [], posterSignals: [], cleanupSignals: [] };
  const event = { id: 42, title: 'Concerto', location: 'Schio', latitude: null, longitude: null, updatedAt: new Date() };
  const imports = {
    'next/server': { after: callback => callbacks.push(callback), NextResponse: { json: (body, settings = {}) => ({ body, status: settings.status ?? 200, headers: settings.headers }) } },
    '@/lib/prisma': { prisma: {
      event: { updateMany: async query => { calls.updates.push(query); if (options.updateError) throw Error('update'); return { count: options.changed ? 0 : 1 }; } },
      eventMedia: { create: async () => { calls.gallery++; if (options.galleryError) throw Object.assign(Error('gallery'), { code: options.galleryCode }); } },
    } },
    '../../lib/google-calendar': { scheduleCalendarDeliveries: () => { calls.calendar++; } },
    '../../lib/supabase': {
      uploadImageToSupabase: async () => { calls.cover++; await options.cover; return 'https://test.supabase.co/cover'; },
      uploadEventMediaToSupabase: async (_file, _eventId, settings) => {
        calls.posterSignals.push(settings?.signal);
        if (options.waitForAbort) await new Promise((resolve, reject) => settings?.signal
          ? settings.signal.addEventListener('abort', () => reject(settings.signal.reason), { once: true })
          : reject(Error('Missing poster deadline')));
        await options.poster;
        return { storagePath: 'poster', url: 'poster-url' };
      },
      deleteEventMediaFromSupabase: async (path, settings) => {
        calls.removed.push(path); calls.cleanupSignals.push(settings?.signal);
        if (options.cleanupWait) await new Promise((resolve, reject) => settings?.signal
          ? settings.signal.addEventListener('abort', () => reject(settings.signal.reason), { once: true })
          : reject(Error('Missing cleanup deadline')));
      },
    },
    '@/lib/geocoding': { geocodeLocation: async () => { calls.geo++; await options.geo; if (options.geoError) throw Error('geo'); return options.coords ?? { latitude: 45, longitude: 11 }; } },
    'next/cache': { revalidatePath: () => { calls.cache++; }, revalidateTag: () => {}, unstable_cache: callback => callback },
    'next-auth/next': { getServerSession: async () => options.session ?? null },
    '../../../pages/api/auth/[...nextauth]': { authOptions: {} },
    '../../../lib/slug-utils': { generateUniqueSlug: () => 'concerto-42' },
    '../../../lib/event-duplicates': { findDuplicateEvent: async () => options.duplicate },
    '../../../lib/event-utils': { toIsoDate: value => value },
    '../../../lib/extension-auth': { authenticateExtensionRequest: async () => ({ userId: 7 }) },
    '../../../lib/extension-cors': { withExtensionCors: response => response, extensionCorsPreflight: () => ({ status: 204 }) },
    '../../../lib/scan-learning-store': { recordScanCorrections: async () => { if (options.learningError) throw Error('learning'); return 1; } },
    '../../../lib/event-series-create': { createEventWithSeries: async data => { calls.creates.push(data); if (options.createError) throw Error('database'); return { event: { ...event, ...data }, seriesSlug: 'series' }; } },
    '../../../lib/event-media': { validateEventMediaFile: () => ({ ok: true, kind: 'image' }) },
  };
  const budgets = [];
  const context = { exports: {}, File, Buffer, URL, AbortSignal: {
    any: signals => AbortSignal.any(signals),
    timeout: milliseconds => { budgets.push(milliseconds); return AbortSignal.timeout(options.fastTimeout ? 15 : milliseconds); },
  }, console: { log() {}, warn() {}, error() {} }, fetch: async () => { calls.warm++; return {}; }, require: name => {
    if (!(name in imports)) throw Error(`Unexpected import ${name}`);
    return imports[name];
  } };
  vm.runInNewContext(compiled, context);
  const body = { title: 'Concerto', location: 'Schio', date: '2026-12-03', scanFeedbackToken: 'mock' };
  const request = { headers: new Headers({ 'content-type': options.multipart ? 'multipart/form-data' : 'application/json' }), nextUrl: { origin: 'http://localhost:3000' }, json: async () => body,
    formData: async () => new Map([['eventData', JSON.stringify(body)], ['image', new File(['cover'], 'cover.png', { type: 'image/png' })], ['posterImage', new File(['poster'], 'poster.png', { type: 'image/png' })]]) };
  return { POST: () => context.exports.POST(request), callbacks, calls, event, budgets };
}

test('201 precedes delayed geocoding/gallery; cover remains blocking', async () => {
  const geo = deferred();
  const poster = deferred();
  const cover = deferred();
  const route = createRoute({ multipart: true, geo: geo.promise, poster: poster.promise, cover: cover.promise });
  let responded = false;
  const pending = route.POST().then(response => { responded = true; return response; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(responded, false);
  assert.equal(route.calls.creates.length, 0);
  cover.resolve();
  const response = await pending;
  assert.equal(response.status, 201);
  assert.equal(route.calls.geo, 0);
  assert.equal(route.calls.gallery, 0);
  const background = route.callbacks[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(route.calls.geo, 1);
  geo.resolve(); poster.resolve();
  await background;
  assert.equal(route.calls.gallery, 1);
  assert.equal(route.calls.updates.length, 1);
  assert.ok(route.calls.cache > 6);
  assert.equal(route.calls.calendar, 1);
});

test('background coordinate update guards id, location, version and original coordinates', async () => {
  const route = createRoute({ changed: true });
  await route.POST();
  const cacheBefore = route.calls.cache;
  await route.callbacks[0]();
  const { where } = route.calls.updates[0];
  assert.equal(where.id, 42);
  assert.equal(where.location, 'Schio');
  assert.equal(where.updatedAt, route.event.updatedAt);
  assert.equal(where.latitude, null);
  assert.equal(where.longitude, null);
  assert.equal(route.calls.cache, cacheBefore);
});

test('nullable coordinates do not update or refresh cache', async () => {
  const route = createRoute({ coords: { latitude: null, longitude: null } });
  await route.POST();
  const cacheBefore = route.calls.cache;
  await route.callbacks[0]();
  assert.equal(route.calls.updates.length, 0);
  assert.equal(route.calls.cache, cacheBefore);
});

for (const failure of ['learningError', 'geoError', 'galleryError', 'updateError']) {
  test(`${failure} cannot prevent independent background tasks or undo 201`, async () => {
    const route = createRoute({ multipart: true, [failure]: true });
    assert.equal((await route.POST()).status, 201);
    await route.callbacks[0]();
    assert.equal(route.calls.geo, 1);
    assert.equal(route.calls.gallery, 1);
    assert.equal(route.calls.warm, 2);
  });
}

for (const [options, expected] of [[{ createError: true }, 500], [{ duplicate: { id: 1, title: 'Existing' } }, 409]]) {
  test(`${expected} never schedules enrichment`, async () => {
    const route = createRoute(options);
    assert.equal((await route.POST()).status, expected);
    assert.equal(route.callbacks.length, 0);
    assert.equal(route.calls.geo, 0);
    assert.equal(route.calls.calendar, 0);
  });
}

test('JSON extension ownership and authenticated ownership remain intact', async () => {
  for (const [session, expected] of [[null, 7], [{ user: { id: '9' } }, 9]]) {
    const route = createRoute({ session });
    const response = await route.POST();
    assert.equal(response.status, 201);
    assert.equal(route.calls.creates[0].createdById, expected);
    assert.equal(response.body.slug, 'concerto-42');
    assert.match(response.headers['Cache-Control'], /no-store/);
  }
});

test('poster upload has a cancelling deadline and cannot block the completed event', async () => {
  const route = createRoute({ multipart: true, waitForAbort: true, fastTimeout: true });
  assert.equal((await route.POST()).status, 201);
  const keepAlive = setTimeout(() => {}, 1000);
  try { await route.callbacks[0](); } finally { clearTimeout(keepAlive); }
  assert.ok(route.calls.posterSignals[0] instanceof AbortSignal);
  assert.equal(route.calls.posterSignals[0].aborted, true);
  assert.equal(route.calls.gallery, 0);
  assert.deepEqual(route.calls.removed, []);
  assert.ok(route.budgets.every(budget => budget > 0 && budget <= 10000));
});

test('uncertain gallery commit never deletes the uploaded poster or persisted cover', async () => {
  const route = createRoute({ multipart: true, galleryError: true });
  assert.equal((await route.POST()).status, 201);
  await route.callbacks[0]();
  assert.deepEqual(route.calls.removed, []);
  assert.equal(route.calls.cover, 1);
});

test('definite gallery rejection cleans only the poster with a cancelling finite budget', async () => {
  const route = createRoute({ multipart: true, galleryError: true, galleryCode: 'P2003', cleanupWait: true, fastTimeout: true });
  assert.equal((await route.POST()).status, 201);
  const keepAlive = setTimeout(() => {}, 1000);
  try { await route.callbacks[0](); } finally { clearTimeout(keepAlive); }
  assert.deepEqual(route.calls.removed, ['poster']);
  assert.equal(route.calls.cleanupSignals[0]?.aborted, true);
});

function mediaHelperFixture(sdkSignal) {
  const clients = [];
  const requests = [];
  const context = {
    exports: {}, File, Buffer, URL, Request, AbortSignal,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://storage.example', SUPABASE_SERVICE_ROLE_SECRET_KEY: 'mock-only' } },
    console: { log() {}, warn() {}, error() {} },
    fetch: async (input, options) => {
      requests.push({ input, options });
      options.signal.throwIfAborted();
      await new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
    },
    require: name => {
      if (name === 'server-only') return {};
      if (name === 'node:crypto') return { randomUUID: () => 'mock-id' };
      if (name === 'sharp') return () => { throw Error('Unexpected optimization'); };
      if (name === '@supabase/supabase-js') return { createClient: (_url, _key, settings) => {
        clients.push(settings);
        const perform = async () => {
          if (settings.global?.fetch) await settings.global.fetch(new Request('https://storage.example/mock', { signal: sdkSignal }), { signal: sdkSignal });
          return { error: null };
        };
        return { storage: { from: () => ({ upload: perform, remove: perform, getPublicUrl: () => ({ data: { publicUrl: 'https://storage.example/mock' } }) }) } };
      } };
      throw Error(`Unexpected import ${name}`);
    },
  };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/lib/supabase.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return { helper: context.exports, clients, requests };
}

for (const abortSource of ['caller', 'sdk']) {
  test(`scoped media upload propagates ${abortSource} cancellation without poisoning the cached client`, async () => {
    const sdk = new AbortController();
    const caller = new AbortController();
    const { helper, clients, requests } = mediaHelperFixture(sdk.signal);
    const file = new File(['cover'], 'cover.png', { type: 'image/png' });
    await helper.uploadEventMediaToSupabase(file, 42);
    const pending = helper.uploadEventMediaToSupabase(file, 42, { signal: caller.signal });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests.length, 1);
    (abortSource === 'caller' ? caller : sdk).abort(Error('mock cancellation'));
    await assert.rejects(pending, /mock cancellation/);
    assert.equal(requests[0].options.signal.aborted, true);
    await helper.uploadEventMediaToSupabase(file, 42);
    assert.equal(clients.length, 2);
    assert.equal(clients[0].global, undefined);
    assert.equal(requests.length, 1);
  });
}

test('scoped poster cleanup cancels its fetch and leaves ordinary cleanup unchanged', async () => {
  const sdk = new AbortController();
  const caller = new AbortController();
  const { helper, clients, requests } = mediaHelperFixture(sdk.signal);
  const pending = helper.deleteEventMediaFromSupabase('42/poster', { signal: caller.signal });
  await new Promise(resolve => setImmediate(resolve));
  caller.abort(Error('cleanup deadline'));
  await assert.rejects(pending, /cleanup deadline/);
  assert.equal(requests[0].options.signal.aborted, true);
  await helper.deleteEventMediaFromSupabase('42/other');
  assert.equal(clients.length, 2);
  assert.equal(clients[1].global, undefined);
});