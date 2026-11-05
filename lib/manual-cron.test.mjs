import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function fixture({ authStatus = 200, secret = 'fixture-secret', fetchImpl = async () => Response.json({ status: 'success' }) } = {}) {
  const calls = [];
  const errors = [];
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path);
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const context = {
      exports: {}, URL, AbortSignal, Error,
      process: { env: { CRON_SECRET_KEY: secret } },
      console: { error: (...args) => errors.push(args) },
      fetch: async (url, init) => {
        calls.push({ url, init });
        return fetchImpl(url, init);
      },
      require(name) {
        if (name.endsWith('/cron-jobs')) return load('./cron-jobs.ts');
        if (name.endsWith('/cron-dispatch')) return load('./cron-dispatch.ts');
        if (name === 'next/server') return { NextResponse: { json: (data, options) => ({ data, status: options?.status ?? 200 }) } };
        if (name === '@/lib/auth-helpers') return {
          withAdminAuth: async (callback) => authStatus === 200 ? callback() : { status: authStatus },
        };
        throw new Error(`Unexpected dependency: ${name}`);
      },
    };
    vm.runInNewContext(compiled, context);
    cache.set(path, context.exports);
    return context.exports;
  }
  const route = load('../app/api/admin/run-cron/route.ts');
  return {
    calls, errors,
    post: (body, { origin = 'https://events.test', invalidJson = false } = {}) => route.POST({
      nextUrl: new URL('https://events.test/api/admin/run-cron'),
      headers: { get: (name) => name === 'origin' ? origin : null },
      json: async () => {
        if (invalidJson) throw new SyntaxError('invalid JSON');
        return body;
      },
    }),
  };
}

test('manual runs require admin auth and reject cross-origin requests before launching jobs', async () => {
  for (const authStatus of [401, 403]) {
    const cron = fixture({ authStatus });
    assert.equal((await cron.post({ jobs: ['instagram-scan'] })).status, authStatus);
    assert.equal(cron.calls.length, 0);
  }
  const cron = fixture();
  assert.equal((await cron.post({ jobs: ['instagram-scan'] }, { origin: 'https://other.test' })).status, 403);
  assert.equal(cron.calls.length, 0);
});

test('invalid selections and malformed JSON never launch jobs', async () => {
  const cron = fixture();
  for (const body of [null, {}, { jobs: [] }, { jobs: 'instagram-scan' }, { jobs: [null] },
    { jobs: ['/api/cron/daily'] }, { jobs: ['instagram-scan', 'unknown'] },
    { jobs: ['instagram-scan', 'instagram-scan'] }]) {
    assert.equal((await cron.post(body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await cron.post({}, { invalidJson: true })).status, 400);
  assert.equal(cron.calls.length, 0);
});

test('manual runs fail closed when CRON_SECRET_KEY is missing', async () => {
  const cron = fixture({ secret: '' });
  assert.equal((await cron.post({ jobs: ['instagram-scan'] })).status, 503);
  assert.equal(cron.calls.length, 0);
});

test('only selected jobs run with server authorization and manual Story scheduling bypass', async () => {
  const cron = fixture();
  const response = await cron.post({ jobs: ['instagram-story', 'google-calendar'] });
  assert.equal(response.status, 200);
  assert.equal(response.data.status, 'success');
  assert.deepEqual(cron.calls.map(({ url }) => url.pathname).sort(), [
    '/api/cron/generate-instagram-story', '/api/cron/sync-google-calendar',
  ]);
  for (const { url, init } of cron.calls) {
    assert.equal(init.headers.authorization, 'Bearer fixture-secret');
    assert.equal(init.cache, 'no-store');
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(url.searchParams.get('force'), url.pathname.includes('story') ? '1' : null);
    assert.equal(url.searchParams.has('publish'), false);
  }
});

test('all selected jobs start in parallel before any finishes', async () => {
  const pending = [];
  const cron = fixture({ fetchImpl: () => new Promise((resolve) => pending.push(resolve)) });
  const responsePromise = cron.post({ jobs: [
    'visitpedemontana', 'google-calendar', 'instagram-story', 'instagram-scan', 'crop-learning-cleanup',
  ] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cron.calls.length, 5);
  assert.equal(pending.length, 5);
  pending.forEach((resolve) => resolve(Response.json({ status: 'success' })));
  assert.equal((await responsePromise).data.jobs.length, 5);
});

test('HTTP errors, partial results and timeouts are reported without stopping other jobs', async () => {
  const cron = fixture({ fetchImpl: async (url) => {
    if (url.pathname.includes('sync-google')) return Response.json({ error: 'not configured' }, { status: 503 });
    if (url.pathname.includes('scan-instagram')) throw new DOMException('Timed out', 'TimeoutError');
    if (url.pathname.includes('scrape-')) return Response.json({ status: 'partial' });
    return Response.json({ status: 'skipped', reason: 'no_data' });
  } });
  const response = await cron.post({ jobs: [
    'visitpedemontana', 'google-calendar', 'instagram-story', 'instagram-scan',
  ] });
  assert.equal(response.data.status, 'partial-error');
  assert.deepEqual([...response.data.failed], ['visitpedemontana', 'google-calendar', 'instagram-scan']);
  const story = response.data.jobs.find(({ key }) => key === 'instagram-story');
  assert.equal(story.ok, true);
  assert.equal(story.data.status, 'skipped');
  assert.equal(response.data.jobs.find(({ key }) => key === 'instagram-scan').error, 'Timed out');
  assert.equal(cron.errors.length, 1);
});
