import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const scraperPath = '../app/api/cron/scrape-visitpedemontana/route.ts';
const manualPath = '../app/api/admin/run-cron/instagram-story/route.ts';

function fixture({ slow = false, overrun = false, secret, resultStatus = 'success', api = false, apiFetchMs = 0, apiEndPage = 2, apiStatus = 200, overlap = false, allowWrites = false } = {}) {
  let now = Date.parse('2026-10-05T04:15:00Z');
  const calls = [];
  const records = new Map();
  const apiPages = [];
  let eventId = 0;
  const sourceRows = [
    { id: 1, name: 'Recent', isActive: true },
    { id: 3, name: 'Older', isActive: true },
  ];
  const model = {
    findMany: async () => {
      const runs = new Map([
        ['scrape-source:1', { jobKey: 'scrape-source:1', startedAt: new Date('2026-10-05T04:00:00Z') }],
        ['scrape-source:3', { jobKey: 'scrape-source:3', startedAt: new Date('2026-09-29T04:00:00Z') }],
      ]);
      for (const [jobKey, run] of records) {
        if (jobKey.startsWith('scrape-source:')) runs.set(jobKey, { jobKey, ...run });
      }
      return [...runs.values()];
    },
    upsert: async ({ where, update, create }) => {
      const existing = records.get(where.jobKey);
      records.set(where.jobKey, { ...existing, ...(existing ? update : create) });
    },
    update: async ({ where, data }) => {
      assert.ok(records.has(where.jobKey));
      records.set(where.jobKey, { ...records.get(where.jobKey), ...data });
    },
    updateMany: async ({ where, data }) => {
      assert.ok(where.jobKey, 'a manual failure must not modify unrelated jobs');
      const existing = records.get(where.jobKey);
      if (where.startedAt && existing?.startedAt?.getTime() !== where.startedAt.getTime()) return { count: 0 };
      records.set(where.jobKey, { ...records.get(where.jobKey), ...data });
      return { count: 1 };
    },
  };
  const execute = async (source, today, dryRun, deadline) => {
    calls.push({ id: source.id, dryRun, deadline });
    if (overlap) records.set('visitpedemontana', { status: 'running', startedAt: new Date(now + 1), resultJson: 'newer run' });
    if (overrun) now += 280_000;
    else if (slow) now += deadline === undefined ? 280_000 : Math.max(0, deadline - now - 10_000);
    return { status: resultStatus, processed: 0 };
  };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const context = {
    exports: {}, Date: Clock, URL, execute,
    setTimeout: (callback, duration) => { now += duration; callback(); },
    console: { log() {}, warn() {}, error() {} },
    process: { env: { CRON_SECRET: secret } },
    AbortSignal,
    fetch: async (url) => {
      if (String(url).includes('deskline.net')) {
        const page = Number(new URL(url).searchParams.get('pageNo'));
        apiPages.push(page);
        now += apiFetchMs;
        return { ok: apiStatus === 200, status: apiStatus, json: async () => ({ events: page >= apiEndPage ? [] : [
          { id: `api-${page}-1`, name: 'API Event' }, { id: `api-${page}-2`, name: 'API Event' },
        ] }) };
      }
      return { ok: true, text: async () => JSON.stringify({ status: resultStatus }) };
    },
  };
  context.require = (name) => {
    if (name === 'next/server') return { NextResponse: { json: (data, options) => ({ data, status: options?.status ?? 200 }) } };
    if (name === '@/lib/prisma') return { prisma: {
      cronSource: { findMany: async () => sourceRows }, cronJobRun: model,
      event: { findMany: async () => [], findFirst: async () => null, create: async ({ data }) => {
        assert.ok(allowWrites, 'dry-run must not write events');
        eventId += 1;
        return { id: eventId, ...data };
      } },
    } };
    if (name === '@/lib/auth-helpers') return { withAdminAuth: (callback) => callback() };
    if (name === 'next/cache') return { revalidatePath() {}, revalidateTag() {} };
    if (name === '@/lib/geocoding') return { geocodeLocation: async () => ({ latitude: null, longitude: null }) };
    if (name.endsWith('/browser-vercel')) return {
      getBrowser: async () => ({ newPage: async () => ({
        setUserAgent: async () => {},
        on: (name, callback) => {
          if (api && name === 'request') callback({
            url: () => 'https://webapi.deskline.net/events?pageNo=0&pageSize=2',
            headers: () => ({ 'dw-source': 'test', 'dw-sessionid': 'test' }),
          });
        },
        goto: async () => {},
        $: async () => null, $$: async () => [], waitForSelector: async () => {},
        evaluate: async () => ({
          pageEventLinks: Array.from({ length: 10 }, (_, index) => `https://www.visitschio.it/#/eventi/TRN/id-${index}/name-${index}`),
          nextPageUrl: null, debugAnchors: [],
        }),
      }) }),
      closeBrowser: async () => {},
    };
    if (name.endsWith('/event-processor')) return { processEventLink: async (url) => {
      calls.push({ url });
      now += 25_000;
      return { events: [{ title: 'Test event', date: '2026-10-10', location: 'Schio' }] };
    } };
    return {};
  };
  function load(path, scraper = false) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const local = { ...context, exports: {} };
    vm.runInNewContext(compiled + (scraper ? '\nscrapeOneSource = execute;' : ''), local);
    return local.exports;
  }
  const request = { headers: new Headers(), nextUrl: new URL('https://example.test/api/cron'), url: 'https://example.test/api/cron', json: async () => ({ target: 'visitpedemontana' }) };
  return { load, calls, records, request, sourceRows, apiPages };
}

test('a slow first source does not starve the second source', async () => {
  const state = fixture({ slow: true });
  await state.load(scraperPath, true).GET(state.request);
  assert.equal(state.calls.length, 2);
  assert.ok(state.calls.every(({ deadline }) => Number.isFinite(deadline)));
});

test('the source last started on September 29 is attempted first', async () => {
  const state = fixture();
  await state.load(scraperPath, true).GET(state.request);
  assert.equal(state.calls[0].id, 3);
});

test('automatic runs refresh the aggregate job displayed by the admin page', async () => {
  const state = fixture();
  await state.load(scraperPath, true).GET(state.request);
  const aggregate = state.records.get('visitpedemontana');
  assert.equal(aggregate?.status, 'completed');
  assert.ok(aggregate.finishedAt);
  assert.equal(JSON.parse(aggregate.resultJson).sourcesProcessed, 2);
});

test('budget overruns are visible rather than reported as complete success', async () => {
  const state = fixture({ overrun: true });
  const response = await state.load(scraperPath, true).GET(state.request);
  assert.equal(response.data.status, 'partial');
  assert.equal(response.data.sourcesProcessed, 1);
  assert.equal(response.data.sources[1].status, 'skipped');
});

test('scraping failures update the aggregate job as failed', async () => {
  const state = fixture({ resultStatus: 'error' });
  const response = await state.load(scraperPath, true).GET(state.request);
  assert.equal(response.data.status, 'partial-error');
  assert.equal(state.calls.length, 2);
  assert.equal(state.records.get('visitpedemontana')?.status, 'failed');
});

test('unauthorized requests do not scrape or mutate run records', async () => {
  const state = fixture({ secret: 'test-secret' });
  const response = await state.load(scraperPath, true).GET(state.request);
  assert.equal(response.status, 401);
  assert.equal(state.calls.length, 0);
  assert.equal(state.records.size, 0);
});

test('dry-run mode reaches every source and remains explicit in the aggregate result', async () => {
  const state = fixture();
  state.request.nextUrl.searchParams.set('dryRun', '1');
  const response = await state.load(scraperPath, true).GET(state.request);
  assert.equal(response.data.dryRun, true);
  assert.ok(state.calls.every(({ dryRun }) => dryRun));
  assert.equal(JSON.parse(state.records.get('visitpedemontana').resultJson).dryRun, true);
});

test('manual triggers do not label an HTTP 200 partial-error as completed', async () => {
  const state = fixture({ resultStatus: 'partial-error' });
  const response = await state.load(manualPath).POST(state.request);
  assert.equal(response.data.status, 500);
  assert.equal(state.records.get('visitpedemontana').status, 'failed');
});

test('the manual proxy has enough execution time to await a daily scraper', () => {
  const state = fixture();
  assert.equal(state.load(manualPath).maxDuration, 300);
});

test('the real extraction loop yields its budget and dry-run never writes events', async () => {
  const state = fixture();
  state.request.nextUrl.searchParams.set('dryRun', '1');
  const response = await state.load(scraperPath).GET(state.request);
  assert.equal(response.data.sourcesProcessed, 2);
  assert.equal(response.data.status, 'partial');
  for (const source of response.data.sources) {
    assert.ok(source.processed > 0);
    assert.ok(source.deferred > 0);
    assert.equal(source.processed + source.deferred, 10);
  }
  assert.ok(state.calls.length < 20);
});

test('collection reserves processing time even when the API has unlimited pages', async () => {
  const state = fixture({ api: true, apiFetchMs: 8000, apiEndPage: Infinity });
  state.request.nextUrl.searchParams.set('dryRun', '1');
  const response = await state.load(scraperPath).GET(state.request);
  assert.equal(response.data.sourcesProcessed, 2);
  assert.ok(response.data.sources.every(source => source.processed > 0 && source.collectionIncomplete));
});

test('a fully traversed API is not labeled as incomplete', async () => {
  const state = fixture({ api: true });
  state.request.nextUrl.searchParams.set('dryRun', '1');
  const response = await state.load(scraperPath).GET(state.request);
  assert.ok(response.data.sources.every(source => !source.collectionIncomplete && source.nextApiPage === 0));
});

test('unfinished API pages and pending links resume on the following run', async () => {
  const state = fixture({ api: true, apiFetchMs: 8000, apiEndPage: Infinity, allowWrites: true });
  state.sourceRows.splice(1);
  const scraper = state.load(scraperPath);
  await scraper.GET(state.request);
  const previous = JSON.parse(state.records.get('scrape-source:1').resultJson);
  assert.ok(previous.nextApiPage > 0);
  assert.ok(previous.pendingEventLinks.length > 0);
  state.apiPages.length = 0;
  const response = await scraper.GET(state.request);
  assert.equal(state.apiPages[0], previous.nextApiPage);
  assert.equal(response.data.sources[0].links[0].url, previous.pendingEventLinks[0]);
});

test('many configured sources receive usable budgets, with excess work explicitly skipped', async () => {
  const state = fixture({ slow: true });
  state.sourceRows.push(...[4, 5, 6].map(id => ({ id, name: `Source ${id}`, isActive: true })));
  const response = await state.load(scraperPath, true).GET(state.request);
  assert.equal(state.calls.length, 2);
  assert.equal(response.data.sources.filter(({ status }) => status === 'skipped').length, 3);
  assert.equal(response.data.status, 'partial');
});

test('an older automatic run does not overwrite a newer aggregate run', async () => {
  const state = fixture({ overlap: true });
  await state.load(scraperPath, true).GET(state.request);
  assert.equal(state.records.get('visitpedemontana').status, 'running');
  assert.equal(state.records.get('visitpedemontana').resultJson, 'newer run');
});

test('API HTTP failures are persisted as errors, not ordinary budget deferral', async () => {
  const state = fixture({ api: true, apiStatus: 503 });
  state.request.nextUrl.searchParams.set('dryRun', '1');
  const response = await state.load(scraperPath).GET(state.request);
  assert.equal(response.data.status, 'partial-error');
  assert.equal(state.records.get('visitpedemontana').status, 'failed');
  assert.ok(response.data.sources.every(source => source.errors.some(({ error }) => error.includes('503'))));
});

test('the default source restores the same pagination checkpoint as configured sources', async () => {
  const state = fixture({ api: true });
  state.sourceRows.length = 0;
  state.records.set('scrape-source:default', {
    status: 'completed', startedAt: new Date('2026-09-29T04:00:00Z'),
    resultJson: JSON.stringify({ nextApiPage: 1, pendingEventLinks: ['https://www.visitschio.it/#/eventi/TRN/pending-id/pending-event'] }),
  });
  state.request.nextUrl.searchParams.set('dryRun', '1');
  const response = await state.load(scraperPath).GET(state.request);
  assert.equal(state.apiPages[0], 1);
  assert.ok(response.data.sources[0].links.some(({ url }) => url.includes('/pending-id/')));
});