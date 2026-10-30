import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const routePath = '../app/api/cron/daily/route.ts';

function loadDailyCron(env, fetchImpl) {
  const source = readFileSync(new URL(routePath, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const calls = [];
  const context = {
    exports: {},
    Buffer,
    URL,
    AbortSignal,
    console: { ...console, error: () => {} },
    process: { env },
    fetch: async (url, init) => {
      calls.push({ path: new URL(url).pathname, authorization: init.headers.authorization });
      return fetchImpl(new URL(url).pathname);
    },
    require(name) {
      if (name === 'node:crypto') return require('node:crypto');
      if (name === 'next/server') {
        return { NextResponse: { json: (data, options) => ({ data, status: options?.status ?? 200 }) } };
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(compiled, context);
  context.exports.calls = calls;
  return context.exports;
}

const require = (await import('node:module')).createRequire(import.meta.url);

function request(authorization) {
  return {
    headers: { get: () => authorization },
    nextUrl: new URL('https://events.test/api/cron/daily'),
  };
}

const JOBS = [
  '/api/cron/scrape-visitpedemontana',
  '/api/cron/sync-google-calendar',
  '/api/cron/generate-instagram-story',
];

test('the daily cron fails closed without secrets and rejects wrong tokens', async () => {
  const ok = async () => Response.json({ status: 'success' });

  const missing = loadDailyCron({}, ok);
  assert.equal((await missing.GET(request('Bearer x'))).status, 503);

  const wrong = loadDailyCron({ CRON_SECRET: 'vercel-secret' }, ok);
  assert.equal((await wrong.GET(request('Bearer nope'))).status, 401);
  assert.equal(wrong.calls.length, 0);
});

test('the daily cron runs every scheduled job forwarding the cron authorization', async () => {
  const cron = loadDailyCron({ CRON_SECRET: 'vercel-secret' }, async () => Response.json({ status: 'success' }));

  const response = await cron.GET(request('Bearer vercel-secret'));

  assert.equal(response.status, 200);
  assert.equal(response.data.status, 'success');
  assert.deepEqual(cron.calls.map(({ path }) => path).sort(), [...JOBS].sort());
  assert.ok(cron.calls.every(({ authorization }) => authorization === 'Bearer vercel-secret'));
});

test('a failing job does not stop the others and is reported as partial error', async () => {
  const cron = loadDailyCron({ CRON_SECRET_KEY: 'legacy' }, async (path) => {
    if (path === '/api/cron/sync-google-calendar') {
      return Response.json({ error: 'Google Calendar non configurato' }, { status: 503 });
    }
    if (path === '/api/cron/scrape-visitpedemontana') throw new Error('network down');
    return Response.json({ status: 'skipped', reason: 'not_scheduled' });
  });

  const response = await cron.GET(request('Bearer legacy'));

  assert.equal(response.status, 200);
  assert.equal(response.data.status, 'partial-error');
  assert.deepEqual([...response.data.failed].sort(), ['google-calendar', 'visitpedemontana']);
  const story = response.data.jobs.find(({ key }) => key === 'instagram-story');
  assert.equal(story.ok, true);
  assert.equal(story.data.status, 'skipped');
});
