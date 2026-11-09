import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessagingEngine } from './engine.ts';
import { EncryptedFileStore } from './store.ts';
import { MessagingError } from '../../../lib/personal-messaging.ts';
import { createMessagingServer } from './http.ts';
import { lock } from 'proper-lockfile';

function fixture() {
  const saved = new Map(); const callbacks = []; const adapters = [];
  const store = { read: async (owner, platform) => structuredClone(saved.get(`${owner}:${platform}`)), write: async account => { saved.set(`${account.owner}:${account.platform}`, structuredClone(account)); } };
  const factory = (_platform, emit) => {
    callbacks.push(emit);
    const adapter = { start: async () => emit({ status: 'code' }), submit: async (kind, value) => {
      if (value === 'bad') throw new MessagingError(kind === 'code' ? 'code_invalid' : 'password_invalid');
      if (kind === 'code') await emit({ status: 'password' }); else await emit({ status: 'connected', session: 'fixture-private-session' });
    }, restore: async session => emit({ status: 'connected', session }), list: async () => [{ id: '@news', title: 'News', kind: 'broadcast' }], verify: async id => id.startsWith('group:')
      ? { id, title: 'Group', kind: 'group', groupType: 'supergroup', accessHash: 'private-hash', baselineMessageId: 10 }
      : ({ id, title: 'News', kind: id === 'personal' ? 'private' : 'broadcast' }),
    poll: async (_source, after) => ({ cursor: after + 1, messages: [{ id: after + 1, text: 'Concerto 12 giugno 2027 presso Teatro Comunale' }], discarded: 0, readCount: 1 }),
    close: async () => true };
    adapters.push(adapter); return adapter;
  };
  let now = 1000000;
  const engine = new MessagingEngine(store, factory, () => now);
  const run = (action, extra = {}, owner = 1) => engine.execute(owner, { platform: 'telegram', action, ...extra });
  const connect = async () => { await run('start', { phone: '+391234567890' }); await run('code', { code: 'good' }); return run('password', { password: 'good' }); };
  return { engine, store, saved, callbacks, adapters, run, connect, advance: milliseconds => { now += milliseconds; } };
}
test('fake provider login errors, 2FA and session-free response; no events', async () => {
  const flow = fixture();
  assert.equal((await flow.run('start', { phone: '+391234567890' })).status, 'code');
  await assert.rejects(flow.run('code', { code: 'bad' }), /code_invalid/);
  assert.equal((await flow.run('code', { code: 'good' })).status, 'password');
  await assert.rejects(flow.run('password', { password: 'bad' }), /password_invalid/);
  const result = await flow.run('password', { password: 'good' });
  assert.equal(result.status, 'connected');
  assert.ok(!JSON.stringify(result).includes('fixture-private-session'));
});
test('owners never share QR, session or sources', async () => {
  const flow = fixture(); await flow.connect(); await flow.run('authorize', { source: '@news', consent: true });
  const other = await flow.run('status', {}, 2);
  assert.equal(other.status, 'disconnected'); assert.deepEqual(other.sources, []);
  await assert.rejects(flow.run('pause', { source: '@news' }, 2), /source_unavailable/);
});
test('expiry and bounded attempts require fresh login', async () => {
  const flow = fixture(); await flow.run('start', { phone: '+391234567890' });
  flow.advance(300001);
  await assert.rejects(flow.run('code', { code: 'good' }), /login_expired/);
  await flow.callbacks[0]({ status: 'connected', session: 'late' });
  assert.notEqual((await flow.run('status')).status, 'connected');
  await flow.run('start', { phone: '+391234567890' });
  for (let attempt = 0; attempt < 5; attempt++) await assert.rejects(flow.run('code', { code: 'bad' }), /code_invalid/);
  await assert.rejects(flow.run('code', { code: 'good' }), /rate_limited/);
});
test('logout and new login invalidate old callbacks and consent', async () => {
  const flow = fixture(); await flow.connect(); await flow.run('authorize', { source: '@news', consent: true });
  const old = flow.callbacks[0]; await flow.run('disconnect');
  await old({ status: 'connected', session: 'late' });
  assert.equal((await flow.run('status')).status, 'disconnected');
  await flow.run('start', { phone: '+391234567890' }); await old({ status: 'connected', session: 'late' });
  const result = await flow.run('status'); assert.equal(result.status, 'code'); assert.equal(result.sources[0].active, false);
});
test('source verification rejects personal chats and enforces 50 sources', async () => {
  const flow = fixture(); await flow.connect();
  await assert.rejects(flow.run('authorize', { source: 'personal', consent: true }), /source_unavailable/);
  for (let index = 0; index < 50; index++) await flow.run('authorize', { source: `@news${index}`, consent: true });
  await assert.rejects(flow.run('authorize', { source: '@overflow', consent: true }), /source_limit/);
  await flow.run('pause', { source: '@news0' });
  assert.equal((await flow.run('status')).sources[0].active, false);
});
test('source listing preserves an explicit bounded-enumeration truncation indicator', async () => {
  const flow = fixture(); await flow.connect();
  flow.adapters[0].list = async () => Object.assign(
    Array.from({ length: 600 }, (_, index) => ({ id: `group:basic:${index + 1}`, title: `Group ${index + 1}`, kind: 'group' })),
    { truncated: true },
  );
  const result = await flow.run('sources');
  assert.equal(result.availableSources.length, 600);
  assert.equal(result.availableSourcesTruncated, true);
});
test('Telegram grants use stable provider IDs, not recyclable usernames', async () => {
  const flow = fixture(); await flow.connect();
  flow.adapters[0].verify = async reference => ({ id: '123456789', reference, title: 'Same channel', kind: 'broadcast' });
  await flow.run('authorize', { source: '@original', consent: true });
  await flow.run('authorize', { source: '@renamed', consent: true });
  const result = await flow.run('status'); assert.equal(result.sources.length, 1); assert.equal(result.sources[0].id, '123456789'); assert.equal(result.sources[0].reference, '@renamed');
});
test('group grants establish a fresh encrypted baseline and public status omits handles and cursors', async () => {
  const flow = fixture(); await flow.connect();
  await flow.run('authorize', { source: 'group:supergroup:12345', consent: true });
  const saved = flow.saved.get('1:telegram');
  const grant = saved.sources[0];
  assert.equal(grant.baselineMessageId, 10); assert.equal(grant.cursorMessageId, 10);
  assert.equal(grant.accessHash, 'private-hash');
  const status = await flow.run('status');
  assert.equal(status.sources[0].kind, 'group');
  assert.ok(!JSON.stringify(status).includes('private-hash'));
  assert.ok(!JSON.stringify(status).includes('baselineMessageId'));
  assert.ok(!JSON.stringify(status).includes('cursorMessageId'));
  assert.ok(!JSON.stringify(status).includes('pendingCursorMessageId'));
});
test('group scan cursor is acknowledged only after app commit and acknowledgements are idempotent', async () => {
  const flow = fixture(); await flow.connect();
  await flow.run('authorize', { source: 'group:supergroup:12345', consent: true });
  const source = flow.saved.get('1:telegram').sources[0];
  const page = await flow.engine.scan(1, source.id, source.revision, { limit: 10 });
  assert.equal(page.cursor, 11);
  assert.equal(flow.saved.get('1:telegram').sources[0].cursorMessageId, 10);
  assert.equal(flow.saved.get('1:telegram').sources[0].pendingCursorMessageId, 11);
  await flow.engine.acknowledge(1, source.id, source.revision, page.cursor);
  await flow.engine.acknowledge(1, source.id, source.revision, page.cursor);
  assert.equal(flow.saved.get('1:telegram').sources[0].cursorMessageId, 11);
  assert.equal(flow.saved.get('1:telegram').sources[0].pendingCursorMessageId, undefined);
});
test('revoking a source fences an unacknowledged scan page', async () => {
  const flow = fixture(); await flow.connect();
  await flow.run('authorize', { source: 'group:supergroup:12345', consent: true });
  const source = flow.saved.get('1:telegram').sources[0];
  const page = await flow.engine.scan(1, source.id, source.revision);
  await flow.run('pause', { source: source.id });
  await assert.rejects(flow.engine.acknowledge(1, source.id, source.revision, page.cursor), /source_unavailable/);
});
test('dry-run restores and reads without writing account, grant or cursor state', async () => {
  const flow = fixture(); await flow.connect();
  await flow.run('authorize', { source: 'group:supergroup:12345', consent: true });
  const before = structuredClone(flow.saved.get('1:telegram'));
  const dryRun = new MessagingEngine(flow.store, flow.engine.factory);
  const page = await dryRun.scan(1, 'group:supergroup:12345', before.sources[0].revision, { dryRun: true });
  assert.equal(page.dryRun, true); assert.equal(page.cursor, 11);
  assert.deepEqual(flow.saved.get('1:telegram'), before);
});
test('pause during verification prevents a late source grant', async () => {
  const flow = fixture(); await flow.connect(); await flow.run('authorize', { source: '@news', consent: true });
  let finish; flow.adapters[0].verify = () => new Promise(resolve => { finish = resolve; });
  const pending = flow.run('authorize', { source: '@late', consent: true });
  await new Promise(resolve => setImmediate(resolve));
  await flow.run('pause', { source: '@news' }); finish({ id: '@late', title: 'Late', kind: 'broadcast' });
  await assert.rejects(pending, /operation_cancelled/);
  assert.equal((await flow.run('status')).sources.length, 1);
});
test('disconnect during login cannot resurrect the session', async () => {
  const flow = fixture(); let finish;
  flow.engine.factory = (_platform, emit) => ({ start: () => new Promise(resolve => { finish = async () => { await emit({ status: 'connected', session: 'late' }); resolve(); }; }), close: async () => true });
  const pending = flow.run('start', { phone: '+391234567890' });
  await new Promise(resolve => setImmediate(resolve)); await flow.run('disconnect'); await finish();
  await assert.rejects(pending, /operation_cancelled/); assert.equal((await flow.run('status')).status, 'disconnected');
});
test('restart restores only confirmed sessions; unconfirmed logout is explicit', async () => {
  const flow = fixture(); await flow.connect();
  const restarted = new MessagingEngine(flow.store, flow.engine.factory);
  const status = await restarted.execute(1, { action: 'status', platform: 'telegram' }); assert.equal(status.status, 'connected');
  flow.adapters.at(-1).close = async () => { throw new Error('offline'); };
  assert.equal((await restarted.execute(1, { action: 'disconnect', platform: 'telegram' })).remoteRemoved, false);
});
test('encrypted durable storage restores after restart without plaintext credentials', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'messaging-test-'));
  try {
    const store = new EncryptedFileStore(directory, Buffer.alloc(32, 7));
    const flow = fixture(); flow.engine.store = store; await flow.connect();
    const packed = await readFile(join(directory, '1-telegram.sealed'), 'utf8'); assert.ok(!packed.includes('fixture-private-session'));
    const restored = new MessagingEngine(store, flow.engine.factory);
    assert.equal((await restored.execute(1, { action: 'status', platform: 'telegram' })).status, 'connected');
    assert.equal(await store.read(2, 'telegram'), undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('failed provider start is not a pending or successful login', async () => {
  const flow = fixture(); flow.engine.factory = () => { throw new MessagingError('provider_unavailable', 503); };
  await assert.rejects(flow.run('start', { phone: '+391234567890' }), /provider_unavailable/);
  assert.equal((await flow.run('status')).status, 'disconnected');
  assert.equal(flow.saved.get('1:telegram').session, undefined);
});
test('WhatsApp QR is ephemeral, owner scoped and invalidated by logout', async () => {
  const flow = fixture(); let emit;
  flow.engine.factory = (_platform, callback) => { emit = callback; return { start: async () => callback({ status: 'qr', qr: 'fixture-qr' }), close: async () => true }; };
  const result = await flow.engine.execute(1, { action: 'start', platform: 'whatsapp' }); assert.equal(result.qr, 'fixture-qr');
  assert.ok(!JSON.stringify(flow.saved.get('1:whatsapp')).includes('fixture-qr'));
  assert.equal((await flow.engine.execute(2, { action: 'status', platform: 'whatsapp' })).qr, undefined);
  await flow.engine.execute(1, { action: 'disconnect', platform: 'whatsapp' }); await emit({ status: 'connected', session: 'late' });
  assert.equal((await flow.engine.execute(1, { action: 'status', platform: 'whatsapp' })).status, 'disconnected');
});
test('provider error codes are distinguished without constructing live adapters', async () => {
  const { providerError, assertProviderConfiguration } = await import('./adapters.ts');
  assert.throws(() => assertProviderConfiguration('telegram', {}), /telegram_configuration_missing/);
  assert.doesNotThrow(() => assertProviderConfiguration('whatsapp', {}));
  for (const [errorMessage, code] of [['PHONE_CODE_INVALID', 'code_invalid'], ['PHONE_CODE_EXPIRED', 'code_expired'], ['PASSWORD_HASH_INVALID', 'password_invalid'], ['FLOOD_WAIT_60', 'telegram_flood_wait'], ['private-sdk-details', 'provider_unavailable']]) assert.equal(providerError({ errorMessage }).code, code);
});
test('real local HTTP transport authenticates before providers and bounds owner-scoped commands', async () => {
  const flow = fixture(); let configurations = 0;
  const secret = 'a'.repeat(64);
  const server = createMessagingServer(flow.engine, secret, () => { configurations++; });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/command`;
  const send = (body, authorization = `Bearer ${secret}`) => fetch(url, { method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  try {
    assert.equal((await send({ owner: 1, command: { action: 'start', platform: 'telegram', phone: '+391234567890' } }, 'Bearer wrong')).status, 401);
    assert.equal(configurations, 0); assert.equal(flow.adapters.length, 0);
    assert.equal((await send('x'.repeat(5000))).status, 413);
    assert.equal((await send({ owner: 1, command: { action: 'status', platform: 'telegram', owner: 2 } })).status, 400);
    assert.equal((await send({ owner: 1, command: { action: 'start', platform: 'telegram', phone: '+391234567890' } })).status, 200);
    const other = await send({ owner: 2, command: { action: 'status', platform: 'telegram' } });
    assert.equal((await other.json()).status, 'disconnected');
    const status = await send({ owner: 1, command: { action: 'status', platform: 'telegram' } }); assert.equal((await status.json()).status, 'code');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('single-writer lock rejects a second worker and recovers a stale crash lock', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'messaging-lock-'));
  const lockPath = join(directory, '.worker.lock');
  try {
    await mkdir(lockPath); const old = new Date(Date.now() - 30000); await utimes(lockPath, old, old);
    const release = await lock(directory, { lockfilePath: lockPath, stale: 10000, update: 2000 });
    try { await assert.rejects(lock(directory, { lockfilePath: lockPath }), error => error.code === 'ELOCKED'); }
    finally { await release(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

const turn = () => new Promise(resolve => setImmediate(resolve));
test('connected is published only after durable persistence and rejected writes fail closed', async () => {
  const flow = fixture(); await flow.run('start', { phone: '+391234567890' }); await flow.run('code', { code: 'good' });
  const write = flow.store.write; let rejectWrite;
  flow.store.write = account => account.status === 'connected' ? new Promise((_resolve, reject) => { rejectWrite = reject; }) : write(account);
  const login = flow.run('password', { password: 'good' }); const rejected = assert.rejects(login, /provider_unavailable/);
  await turn(); assert.notEqual((await flow.run('status')).status, 'connected');
  rejectWrite(new Error('disk full')); await rejected;
  assert.notEqual((await flow.run('status')).status, 'connected');
  assert.equal(flow.saved.get('1:telegram').session, undefined);
});
test('concurrent disconnects share cleanup and persist uncertainty before erasing the session', async () => {
  const flow = fixture(); await flow.connect();
  const write = flow.store.write; const writes = []; let release; let closes = 0;
  flow.adapters[0].close = async remote => { if (remote) closes++; return false; };
  flow.store.write = async account => { writes.push(structuredClone(account)); if (writes.length === 1) await new Promise(resolve => { release = resolve; }); await write(account); };
  const first = flow.run('disconnect'); await turn(); const second = flow.run('disconnect'); await turn();
  assert.equal(writes[0].remoteRemoved, false); release();
  const results = await Promise.all([first, second]);
  assert.equal(closes, 1); assert.ok(results.every(result => result.remoteRemoved === false));
  assert.equal(flow.saved.get('1:telegram').session, undefined);
});
test('invalidation write failure still closes detached transport', async () => {
  const flow = fixture(); await flow.connect(); let closes = 0;
  flow.adapters[0].close = async () => { closes++; return true; };
  flow.store.write = async () => { throw new Error('disk full'); };
  await assert.rejects(flow.run('disconnect')); await turn();
  assert.ok(closes > 0); assert.notEqual(flow.engine.entries.get('1:telegram').account.status, 'connected');
});
test('fourth start rejected by admission preserves current challenge and connected grants', async () => {
  const flow = fixture();
  for (let count = 0; count < 3; count++) await flow.run('start', { phone: '+391234567890' });
  const challenge = await flow.run('status'); await assert.rejects(flow.run('start', { phone: '+391234567890' }), /rate_limited/);
  assert.deepEqual(await flow.run('status'), challenge);
  await flow.run('code', { code: 'good' }); await flow.run('password', { password: 'good' }); await flow.run('authorize', { source: '@news', consent: true });
  const connected = await flow.run('status'); await assert.rejects(flow.run('start', { phone: '+391234567890' }), /rate_limited/);
  assert.deepEqual(await flow.run('status'), connected);
});
test('abort during source verification rejects late completion without destroying the encrypted session', async () => {
  const flow = fixture(); await flow.connect(); let finish;
  flow.adapters[0].verify = () => new Promise(resolve => { finish = resolve; });
  const controller = new AbortController();
  const pending = flow.engine.execute(1, { platform: 'telegram', action: 'authorize', source: '@late', consent: true }, controller.signal);
  const rejected = assert.rejects(pending, /worker_unavailable|operation_cancelled/);
  await turn(); controller.abort(); finish({ id: '@late', title: 'Late', kind: 'broadcast' }); await rejected;
  assert.equal(flow.saved.get('1:telegram').sources.length, 0); assert.ok(flow.saved.get('1:telegram').session);
  assert.notEqual(flow.engine.entries.get('1:telegram').account.status, 'connected');
});
test('deadline during restore blocks late provider login and listing timeout retains confirmed local grants', async () => {
  const flow = fixture(); await flow.connect(); await flow.run('authorize', { source: '@news', consent: true });
  let finish; let emit;
  const restored = new MessagingEngine(flow.store, (_platform, callback) => {
    emit = callback; return { restore: () => new Promise(resolve => { finish = resolve; }), close: async () => true };
  });
  const controller = new AbortController();
  const pending = restored.execute(1, { platform: 'telegram', action: 'status' }, controller.signal);
  const rejected = assert.rejects(pending, /worker_unavailable|operation_cancelled/);
  await turn(); controller.abort(); await emit({ status: 'connected', session: 'late-session' }); finish(); await rejected;
  assert.notEqual(restored.entries.get('1:telegram').account.status, 'connected'); assert.notEqual(flow.saved.get('1:telegram').session, 'late-session');
  flow.adapters[0].list = () => new Promise(resolve => { finish = resolve; });
  const listingController = new AbortController();
  const listing = flow.engine.execute(1, { platform: 'telegram', action: 'sources' }, listingController.signal);
  const listingRejected = assert.rejects(listing, /worker_unavailable/); await turn(); listingController.abort(); finish([]); await listingRejected;
  assert.equal(flow.saved.get('1:telegram').sources[0].active, true); assert.ok(flow.saved.get('1:telegram').session);
});
test('encrypted disconnect marker survives crash before local erasure and delayed writes cannot resurrect revoked grants', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'messaging-disconnect-'));
  try {
    const disk = new EncryptedFileStore(directory, Buffer.alloc(32, 9)); const flow = fixture(); flow.engine.store = disk;
    await flow.connect(); await flow.run('authorize', { source: '@news', consent: true });
    const write = disk.write.bind(disk); let marker; let release; let count = 0;
    disk.write = async account => { if (++count === 2) await new Promise(resolve => { release = resolve; }); await write(account); if (count === 1) marker = await disk.read(1, 'telegram'); };
    const logout = flow.run('disconnect'); await turn();
    while (!release) await turn();
    assert.equal(marker.remoteRemoved, false); assert.ok(marker.session);
    const crashStore = { read: async () => structuredClone(marker), write: async () => {} };
    const restarted = new MessagingEngine(crashStore, () => { throw new Error('must not restore'); });
    assert.equal((await restarted.execute(1, { platform: 'telegram', action: 'status' })).status, 'disconnected');
    release(); await logout; const erased = await disk.read(1, 'telegram'); assert.equal(erased.session, undefined); assert.equal(erased.sources[0].active, false);
    assert.ok(!(await readFile(disk.path(1, 'telegram'), 'utf8')).includes('fixture-private-session'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('HTTP deadline cancels engine work before a late verification result', async () => {
  const flow = fixture(); await flow.connect(); let finish; let passedSignal;
  flow.adapters[0].verify = () => new Promise(resolve => { finish = resolve; });
  const execute = flow.engine.execute.bind(flow.engine);
  flow.engine.execute = (owner, command, signal) => { passedSignal = signal; return execute(owner, command, signal); };
  const secret = 'a'.repeat(64); const server = createMessagingServer(flow.engine, secret, () => {}, 30);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/command`, { method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify({ owner: 1, command: { platform: 'telegram', action: 'authorize', source: '@late', consent: true } }) });
    assert.equal(response.status, 503); assert.equal(passedSignal?.aborted, true);
    finish({ id: '@late', title: 'Late', kind: 'broadcast' }); await turn(); await turn();
    assert.equal(flow.saved.get('1:telegram').sources.length, 0);
  } finally { finish?.({ id: '@late', title: 'Late', kind: 'broadcast' }); await new Promise(resolve => server.close(resolve)); }
});
test('cancelled queued grant is never admitted to storage after a blocked earlier write', async () => {
  const flow = fixture(); await flow.connect();
  const entry = flow.engine.entries.get('1:telegram'); const write = flow.store.write; const writes = []; let release;
  flow.store.write = async account => { writes.push(structuredClone(account)); if (writes.length === 1) await new Promise(resolve => { release = resolve; }); await write(account); };
  const blocker = flow.engine.write(entry, entry.account); await turn();
  const controller = new AbortController(); const pending = flow.engine.execute(1, { platform: 'telegram', action: 'authorize', source: '@late', consent: true }, controller.signal);
  const rejected = assert.rejects(pending, /worker_unavailable|operation_cancelled/);
  await turn(); controller.abort(); release(); await blocker; await rejected; await entry.writes;
  assert.ok(writes.every(account => !account.sources.some(source => source.id === '@late' && source.active)));
});
test('pause during an in-flight grant write never adopts its unconfirmed source', async () => {
  const flow = fixture(); await flow.connect(); await flow.run('authorize', { source: '@news', consent: true });
  const write = flow.store.write; let release; let blocked = false;
  flow.store.write = async account => { if (!blocked && account.sources.some(source => source.id === '@late')) { blocked = true; await new Promise(resolve => { release = resolve; }); } await write(account); };
  const pending = flow.run('authorize', { source: '@late', consent: true }); const rejected = assert.rejects(pending, /operation_cancelled/);
  await turn(); const pause = flow.run('pause', { source: '@news' }); release(); await rejected; await pause;
  assert.ok(!flow.saved.get('1:telegram').sources.some(source => source.id === '@late' && source.active));
});
test('transient transport preserves encrypted session and grants, reconnect is status-only and throttled', async () => {
  const flow = fixture(); await flow.connect(); await flow.run('authorize', { source: '@news', consent: true });
  await flow.callbacks[0]({ status: 'restoring' });
  assert.ok(flow.saved.get('1:telegram').session); assert.equal(flow.saved.get('1:telegram').sources[0].active, true);
  await assert.rejects(flow.run('authorize', { source: '@other', consent: true }), /not_connected/);
  assert.equal((await flow.run('status')).status, 'restoring'); assert.equal(flow.adapters.length, 1);
  flow.advance(5001); assert.equal((await flow.run('status')).status, 'connected'); assert.equal(flow.adapters.length, 2);
  await flow.callbacks[1]({ status: 'disconnected' }); assert.equal(flow.saved.get('1:telegram').session, undefined); assert.equal(flow.saved.get('1:telegram').sources[0].active, false);
});
test('revocation closes detached transport even while its durable write is blocked', async () => {
  const flow = fixture(); await flow.connect(); const write = flow.store.write; let release; let closes = 0; let first = true;
  flow.adapters[0].close = async () => { closes++; return true; };
  flow.store.write = async account => { if (first) { first = false; await new Promise(resolve => { release = resolve; }); } await write(account); };
  const pending = flow.run('start', { phone: '+391234567890' }); await turn();
  const closedBeforeWrite = closes; release(); await pending; assert.equal(closedBeforeWrite, 1);
});

test('failed cursor acknowledgement remains retryable and cannot skip a batch in memory', async () => {
  const flow = fixture(); await flow.connect();
  await flow.run('authorize', { source: 'group:supergroup:1', consent: true });
  await flow.engine.scan(1, 'group:supergroup:1', 1);
  const write = flow.store.write;
  flow.store.write = async () => { throw new Error('disk full'); };
  await assert.rejects(flow.engine.acknowledge(1, 'group:supergroup:1', 1, 11), /disk full/);
  assert.equal(flow.engine.entries.get('1:telegram').account.sources[0].cursorMessageId, 10);
  flow.store.write = write;
  await flow.engine.acknowledge(1, 'group:supergroup:1', 1, 11);
  assert.equal(flow.saved.get('1:telegram').sources[0].cursorMessageId, 11);
});

test('pause during polling fences the page and does not publish its pending cursor', async () => {
  const flow = fixture(); await flow.connect();
  await flow.run('authorize', { source: 'group:supergroup:1', consent: true });
  let release;
  flow.adapters[0].poll = () => new Promise(resolve => { release = resolve; });
  const pending = flow.engine.scan(1, 'group:supergroup:1', 1);
  const rejected = assert.rejects(pending, /operation_cancelled/);
  await turn();
  await flow.run('pause', { source: 'group:supergroup:1' });
  release({ cursor: 11, messages: [], discarded: 1, readCount: 1 });
  await rejected;
  const source = flow.saved.get('1:telegram').sources[0];
  assert.equal(source.active, false);
  assert.equal(source.cursorMessageId, 10);
  assert.equal(source.pendingCursorMessageId, undefined);
});

test('authorization cannot silently use zero when a group baseline was not verified', async () => {
  const flow = fixture(); await flow.connect();
  flow.adapters[0].verify = async id => ({ id, kind: 'group', title: 'Group', groupType: 'basic' });
  await assert.rejects(flow.run('authorize', { source: 'group:basic:1', consent: true }), /source_unavailable/);
  assert.equal(flow.saved.get('1:telegram').sources.length, 0);
});