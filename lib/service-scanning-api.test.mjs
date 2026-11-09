import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as messaging from './personal-messaging.ts';
import * as jsxRuntime from 'react/jsx-runtime';

function moduleWithMocks(path, mocks, extra = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const context = { exports: {}, Date, Request, Response, URL, Buffer, AbortSignal,
    require: name => { if (!(name in mocks)) throw new Error(`Missing mock ${name}`); return mocks[name]; }, ...extra };
  vm.runInNewContext(compiled, context);
  return context.exports;
}
function runner(owner = 7, role = 'admin') {
  const expected = 'https://events.example';
  return moduleWithMocks('./service-scanning-api.ts', {
    'next/server': { NextResponse: { json: (data, options) => ({ data, ...options, headers: new Headers(options?.headers), status: options?.status ?? 200 }) } },
    '../app/lib/auth-helpers': { withAuth: handler => owner === null ? { status: 401, headers: new Headers() } : handler(owner) },
    '../app/lib/prisma': { prisma: { user: { findUnique: async () => ({ role, type: 'user' }) } } },
    './personal-messaging': { ...messaging, requireMessagingOrigin: request => messaging.requireMessagingOrigin(request, expected) },
  }, { process: { env: {} } }).runServiceScan;
}
const request = (body = { dryRun: true }, headers = {}) => new Request('https://events.example/api/admin/messaging/run', {
  method: 'POST', headers: { origin: 'https://events.example', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
});

test('manual scan endpoints enforce DB admin, same origin, JSON boolean payload and no-store', async () => {
  const calls = [];
  const scan = async options => { calls.push(options); return { published: 0, dryRun: options.dryRun }; };
  assert.equal((await runner(null)(request(), 'instagram', scan)).status, 401);
  assert.equal((await runner(7, 'user')(request(), 'instagram', scan)).status, 403);
  assert.equal((await runner(-1)(request(), 'instagram', scan)).status, 403);
  const run = runner();
  for (const headers of [{ origin: 'https://evil.example' }, { origin: '' }, { 'sec-fetch-site': 'cross-site' }]) {
    assert.equal((await run(request({ dryRun: true }, headers), 'instagram', scan)).status, 403);
  }
  assert.equal((await run(request({ dryRun: true }, { 'content-type': 'text/plain' }), 'instagram', scan)).status, 415);
  for (const body of [{}, { dryRun: 'false' }, { dryRun: true, ownerId: 9 }, { dryRun: true, platform: 'telegram' }, []]) {
    assert.equal((await run(request(body), 'instagram', scan)).status, 400);
  }
  const response = await run(request({ dryRun: false }), 'instagram', scan);
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store, private');
  assert.equal(calls.length, 1); assert.equal(calls[0].ownerId, 7); assert.equal(calls[0].dryRun, false);
  assert.ok(calls[0].deadline > Date.now() + 250_000);
});
test('personal runner requires an explicit platform and excludes arbitrary owner/service input', async () => {
  const run = runner();
  let received;
  const scan = async options => { received = options; return { dryRun: true }; };
  for (const body of [{ dryRun: true }, { dryRun: true, platform: 'instagram' }, { dryRun: true, platform: 'whatsapp', source: 'foreign' }]) {
    assert.equal((await run(request(body), 'personal', scan, true)).status, 400);
  }
  assert.equal((await run(request({ dryRun: true, platform: 'whatsapp' }), 'personal', scan, true)).status, 200);
  assert.equal(received.platform, 'whatsapp'); assert.equal(received.ownerId, 7); assert.equal(received.dryRun, true);
});
test('manual runner excludes simultaneous runs per owner/service, releases locks and sanitizes failures', async () => {
  const run = runner();
  let release;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const pending = run(request(), 'instagram', async () => { entered(); return new Promise(resolve => { release = resolve; }); });
  await started;
  assert.equal((await run(request(), 'instagram', async () => { throw new Error('must not run'); })).status, 429);
  assert.equal((await run(request({ dryRun: true, platform: 'whatsapp' }), 'personal', async () => ({}), true)).status, 200);
  release({ status: 'success' }); await pending;
  const failed = await run(request(), 'instagram', async () => { throw new Error('secret token private content'); });
  assert.equal(failed.status, 503); assert.equal(failed.data.error, 'service_scan_failed');
  assert.equal((await run(request(), 'instagram', async () => ({}))).status, 200);
});
test('manual route wiring never invokes aggregate cron or another service', async () => {
  for (const [service, path, dependency, symbol, personal] of [
    ['personal', '../app/api/admin/messaging/run/route.ts', 'personal-telegram-scanning', 'scanPersonalTelegramSources', true],
    ['telegram-bot', '../app/api/admin/telegram/run/route.ts', 'telegram-event-scanning', 'scanTelegramQueue', undefined],
    ['instagram', '../app/api/admin/instagram-scan/run/route.ts', 'instagram-event-scanning', 'scanInstagram', undefined],
  ]) {
    let called = false;
    const scan = () => {};
    const route = moduleWithMocks(path, {
      '../../../../../lib/service-scanning-api': { runServiceScan: async (_request, actual, fn, personalFlag) => {
        assert.equal(actual, service); assert.equal(fn, scan); assert.equal(personalFlag, personal); called = true; return { status: 200 };
      } },
      [`../../../../../lib/${dependency}`]: { [symbol]: scan },
    });
    await route.POST(request()); assert.equal(called, true);
  }
});
test('service pages require a valid session ID and current database admin, never an email allowlist or stale token role', async () => {
  const load = (session, user) => moduleWithMocks('../app/admin/servizi/layout.tsx', {
    'react/jsx-runtime': jsxRuntime,
    'next-auth/next': { getServerSession: async () => session },
    'next/navigation': { redirect: path => { throw new Error(`redirect:${path}`); } },
    './ServiceNavigation': { default: () => null },
    '../../../pages/api/auth/[...nextauth]': { authOptions: {} },
    '../../lib/prisma': { prisma: { user: { findUnique: async () => user } } },
  }).default;
  for (const session of [null, { user: { id: 'NaN' } }, { user: { id: '7evil' } }, { user: { id: '-1' } }]) {
    await assert.rejects(load(session, { role: 'admin' })({ children: 'private' }), /redirect:\/auth/);
  }
  await assert.rejects(load({ user: { id: '7', role: 'admin', email: 'andreacazzola90@gmail.com' } }, { role: 'user', type: 'user' })({ children: 'private' }), /redirect:\/account/);
  assert.ok(await load({ user: { id: '7' } }, { role: 'admin' })({ children: 'private' }));
});
