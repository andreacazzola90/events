import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sealSession, openSession, parseMessagingCommand, requireMessagingOrigin, workerConfiguration } from './personal-messaging.ts';
import { redactPersonalMessagingTelemetry } from './personal-messaging-telemetry.ts';
import { boundedJson, callMessagingWorker, publicMessagingStatus } from './personal-messaging.ts';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as contracts from './personal-messaging.ts';

test('personal sessions bind owner and platform and reject corruption', () => {
  const key = Buffer.alloc(32, 7);
  const sealed = sealSession(1, 'telegram', 'fixture-session', key);
  assert.equal(openSession(1, 'telegram', sealed, key), 'fixture-session');
  assert.throws(() => openSession(2, 'telegram', sealed, key));
  assert.throws(() => openSession(1, 'whatsapp', sealed, key));
  const corrupt = Buffer.from(sealed, 'base64'); corrupt[30] ^= 1;
  assert.throws(() => openSession(1, 'telegram', corrupt.toString('base64'), key));
});
test('strict action payloads and explicit consent', () => {
  assert.throws(() => parseMessagingCommand({ action: 'start', platform: 'signal' }));
  assert.throws(() => parseMessagingCommand({ action: 'status', platform: 'telegram', owner: 2 }));
  assert.throws(() => parseMessagingCommand({ action: 'authorize', platform: 'telegram', source: '123', consent: false }));
  assert.throws(() => parseMessagingCommand({ action: 'start', platform: 'telegram', phone: '123' }));
  assert.equal(parseMessagingCommand({ action: 'status', platform: 'whatsapp' }).action, 'status');
});
test('same origin and missing or unsafe worker config fail closed', () => {
  assert.throws(() => requireMessagingOrigin(new Request('https://app.test/api/admin/messaging', { method: 'POST', headers: { origin: 'https://other.test', 'content-type': 'application/json' } })));
  assert.throws(() => workerConfiguration({}));
  assert.throws(() => workerConfiguration({ PERSONAL_MESSAGING_WORKER_URL: 'http://remote.test', PERSONAL_MESSAGING_WORKER_SECRET: 'a'.repeat(64) }));
  assert.equal(redactPersonalMessagingTelemetry({ request: { url: '/api/admin/messaging', data: { password: 'fixture' } } }), null);
});

test('bounded input, malformed JSON, public status strips worker sessions, hashes and cursors', async () => {
  await assert.rejects(boundedJson(new Request('https://app.test', { method: 'POST', body: 'x'.repeat(5000) })), /payload_too_large/);
  await assert.rejects(boundedJson(new Request('https://app.test', { method: 'POST', body: '{' })), /invalid_payload/);
  const result = publicMessagingStatus({
    platform: 'telegram', status: 'connected', session: 'secret', password: 'secret', cursor: 15,
    sources: [{ id: 'group:supergroup:12345', title: 'Group', kind: 'group', groupType: 'supergroup', accessHash: 'secret', cursorMessageId: 15, baselineMessageId: 10, revision: 3 }],
    availableSources: [{ id: 'group:supergroup:12345', title: 'Group', kind: 'group', groupType: 'supergroup', accessHash: 'secret', cursorMessageId: 15, baselineMessageId: 10 }],
    availableSourcesTruncated: true,
  }, 'telegram');
  assert.ok(!JSON.stringify(result).includes('secret'));
  assert.ok(!JSON.stringify(result).includes('cursor'));
  assert.ok(!JSON.stringify(result).includes('baseline'));
  assert.equal(result.sources[0].kind, 'group');
  assert.equal(result.sources[0].groupType, 'supergroup');
  assert.equal(result.availableSourcesTruncated, true);
  assert.throws(() => publicMessagingStatus({ platform: 'whatsapp', status: 'connected', sources: [] }, 'telegram'));
  assert.throws(() => publicMessagingStatus({ platform: 'telegram', status: 'connected', sources: [{ id: 'person', title: 'person', kind: 'private' }] }, 'telegram'));
});
test('worker offline, redirects, failures and raw SDK errors stay sanitized', async () => {
  const oldFetch = global.fetch; const oldUrl = process.env.PERSONAL_MESSAGING_WORKER_URL; const oldSecret = process.env.PERSONAL_MESSAGING_WORKER_SECRET;
  process.env.PERSONAL_MESSAGING_WORKER_URL = 'http://127.0.0.1:3417'; process.env.PERSONAL_MESSAGING_WORKER_SECRET = 'a'.repeat(64);
  try {
    global.fetch = async (_url, options) => {
      assert.equal(options.redirect, 'error'); assert.ok(options.signal); assert.equal(JSON.parse(options.body).owner, 7);
      throw new Error('SDK private phone and session');
    };
    await assert.rejects(callMessagingWorker(7, { action: 'status', platform: 'telegram' }), error => error.message === 'worker_unavailable' && !error.cause);
    global.fetch = async () => Response.json({ error: 'SDK private phone and session' }, { status: 500 });
    await assert.rejects(callMessagingWorker(7, { action: 'status', platform: 'telegram' }), /worker_unavailable/);
  } finally {
    global.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.PERSONAL_MESSAGING_WORKER_URL; else process.env.PERSONAL_MESSAGING_WORKER_URL = oldUrl;
    if (oldSecret === undefined) delete process.env.PERSONAL_MESSAGING_WORKER_SECRET; else process.env.PERSONAL_MESSAGING_WORKER_SECRET = oldSecret;
  }
});
function routeFixture(user, authenticated = true) {
  const calls = []; const actions = []; let databaseReads = 0;
  const source = readFileSync(new URL('../app/api/admin/messaging/route.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(compiled, { exports: testModule.exports, module: testModule, Request, Response, URL, Map, Date, Object, Promise,
    require: name => {
      if (name === 'next/server') return { NextResponse: { json: (body, options) => Response.json(body, options) } };
      if (name.includes('auth-helpers')) return { withAuth: callback => authenticated ? callback(7) : Response.json({ error: 'Unauthorized' }, { status: 401 }) };
      if (name.endsWith('/prisma')) return { prisma: { user: { findUnique: async () => { databaseReads++; return user; } } } };
      if (name.includes('personal-telegram-scanning')) return {
        personalMessagingSyncRevision: async () => 1,
        revokePersonalTelegramGrant: async (_owner, source, platform) => { actions.push(['revoke', source, platform]); },
        syncPersonalMessagingStatus: async (_owner, _status, options) => { actions.push(['sync', options.platform]); },
        personalTelegramAdminScanStatus: async () => [],
      };
      if (name.includes('personal-messaging')) return { ...contracts, requireMessagingOrigin: request => contracts.requireMessagingOrigin(request, 'https://app.test'), callMessagingWorker: async (owner, command) => { calls.push({ owner, command }); return { status: 'disconnected', sources: [] }; } };
      throw new Error(name);
    },
  });
  return { route: testModule.exports, calls, actions, databaseReads: () => databaseReads };
}
test('route rejects anonymous/non-admin before provider and binds trusted owner', async () => {
  const request = () => new Request('https://app.test/api/admin/messaging', { method: 'POST', headers: { origin: 'https://app.test', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'status', platform: 'telegram' }) });
  const anonymous = routeFixture(undefined, false); assert.equal((await anonymous.route.POST(request())).status, 401); assert.equal(anonymous.databaseReads(), 0); assert.equal(anonymous.calls.length, 0);
  const nonAdmin = routeFixture({ role: 'user', type: 'user' }); assert.equal((await nonAdmin.route.POST(request())).status, 403); assert.equal(nonAdmin.calls.length, 0);
  const admin = routeFixture({ role: 'admin', type: 'user' }); assert.equal((await admin.route.POST(request())).status, 200); assert.equal(admin.calls[0].owner, 7);
});
test('route CSRF, unknown keys/providers and owner injection fail before worker', async () => {
  const fixture = routeFixture({ role: 'admin' });
  for (const [body, origin] of [[{ action: 'status', platform: 'telegram' }, 'https://evil.test'], [{ action: 'status', platform: 'telegram', owner: 9 }, 'https://app.test'], [{ action: 'status', platform: 'signal' }, 'https://app.test']]) {
    const response = await fixture.route.POST(new Request('https://app.test/api/admin/messaging', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    assert.ok(response.status === 400 || response.status === 403);
  }
  assert.equal(fixture.calls.length, 0);
});
test('route revokes the application grant before the worker pause request', async () => {
  const fixture = routeFixture({ role: 'admin' });
  const response = await fixture.route.POST(new Request('https://app.test/api/admin/messaging', {
    method: 'POST', headers: { origin: 'https://app.test', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'pause', platform: 'telegram', source: 'group:supergroup:12345' }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(fixture.actions, [['revoke', 'group:supergroup:12345', 'telegram'], ['sync', 'telegram']]);
});
test('WhatsApp commands revoke and synchronize the same owner/platform before calling the worker', async () => {
  for (const action of ['pause', 'disconnect', 'start']) {
    const fixture = routeFixture({ role: 'admin' });
    const response = await fixture.route.POST(new Request('https://app.test/api/admin/messaging', {
      method: 'POST', headers: { origin: 'https://app.test', 'content-type': 'application/json' },
      body: JSON.stringify({ action, platform: 'whatsapp', ...(action === 'pause' ? { source: '12345@newsletter' } : {}) }),
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(fixture.actions, [['revoke', action === 'pause' ? '12345@newsletter' : undefined, 'whatsapp'], ['sync', 'whatsapp']]);
    assert.equal(fixture.calls[0].owner, 7); assert.equal(fixture.calls[0].command.platform, 'whatsapp');
  }
});
test('telemetry removes nested credentials and drops circular SDK events', () => {
  const redacted = redactPersonalMessagingTelemetry({ nested: { password: 'secret', phone: 'secret', authorization: 'secret' } });
  assert.ok(!JSON.stringify(redacted).includes('secret'));
  const circular = {}; circular.self = circular; assert.equal(redactPersonalMessagingTelemetry(circular), null);
});