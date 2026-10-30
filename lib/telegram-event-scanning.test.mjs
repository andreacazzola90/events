import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { DateTime } from 'luxon';
import * as connectionApi from './telegram-connection.ts';
import { encryptTelegramToken, decryptTelegramToken, telegramApi, telegramWebhookUrl, telegramSecretHash, telegramSecretMatches, requireTelegramSameOrigin, verifyTelegramSource, readTelegramBody } from './telegram-connection.ts';

test('AES-GCM requires a server key, randomizes ciphertext and rejects tampering', () => {
  const previous = process.env.TELEGRAM_ENCRYPTION_KEY;
  try {
    delete process.env.TELEGRAM_ENCRYPTION_KEY;
    assert.throws(() => encryptTelegramToken('secret'), /telegram_key_not_configured/);
    process.env.TELEGRAM_ENCRYPTION_KEY = 'ab'.repeat(32);
    const encrypted = encryptTelegramToken('secret');
    assert.notEqual(encrypted, encryptTelegramToken('secret'));
    assert.equal(decryptTelegramToken(encrypted), 'secret');
    assert.throws(() => decryptTelegramToken(`${encrypted.slice(0, -2)}00`), /telegram_token_unreadable/);
  } finally {
    if (previous === undefined) delete process.env.TELEGRAM_ENCRYPTION_KEY;
    else process.env.TELEGRAM_ENCRYPTION_KEY = previous;
  }
});

test('trusted HTTPS configuration and same-origin mutation checks fail closed', () => {
  const previous = process.env.TELEGRAM_WEBHOOK_BASE_URL;
  const origin = process.env.TELEGRAM_ADMIN_ORIGIN;
  try {
    process.env.TELEGRAM_WEBHOOK_BASE_URL = 'http://localhost:3000';
    assert.throws(() => telegramWebhookUrl('id'), /telegram_https_not_configured/);
    process.env.TELEGRAM_WEBHOOK_BASE_URL = 'https://events.example';
    assert.equal(telegramWebhookUrl('id'), 'https://events.example/api/telegram/webhook?connection=id');
    process.env.TELEGRAM_ADMIN_ORIGIN = 'https://events.example';
    assert.throws(() => requireTelegramSameOrigin(new Request('https://events.example')), /same_origin_required/);
    assert.throws(() => requireTelegramSameOrigin(new Request('https://events.example', { headers: { origin: 'https://evil.example' } })), /same_origin_required/);
    requireTelegramSameOrigin(new Request('https://events.example', { headers: { origin: 'https://events.example' } }));
    assert.equal(telegramSecretMatches('secret', telegramSecretHash('secret')), true);
    assert.equal(telegramSecretMatches('wrong', telegramSecretHash('secret')), false);
  } finally {
    if (previous === undefined) delete process.env.TELEGRAM_WEBHOOK_BASE_URL; else process.env.TELEGRAM_WEBHOOK_BASE_URL = previous;
    if (origin === undefined) delete process.env.TELEGRAM_ADMIN_ORIGIN; else process.env.TELEGRAM_ADMIN_ORIGIN = origin;
  }
});

test('provider failures cannot expose a token, URL, response description or cause', async () => {
  const original = global.fetch;
  const token = '123456:abcdefghijklmnopqrstuvwxyz_12345';
  try {
    global.fetch = async (url) => { throw new Error(`fetch failed at ${url}`); };
    await assert.rejects(telegramApi(token, 'getMe'), error => error.message === 'telegram_unavailable' && !error.cause);
    global.fetch = async () => Response.json({ ok: false, error_code: 401, description: token });
    await assert.rejects(telegramApi(token, 'getMe'), /telegram_token_revoked/);
    global.fetch = async (_url, options) => {
      assert.ok(options.signal);
      assert.equal(options.redirect, 'error');
      return Response.json({ ok: true, result: { id: 1, is_bot: true } });
    };
    assert.equal((await telegramApi(token, 'getMe')).id, 1);
  } finally { global.fetch = original; }
});

test('Bot API distinguishes transient, authentication, source permission and file errors', async () => {
  const original = global.fetch;
  try {
    for (const [status, method, code] of [[500, 'getMe', 'telegram_unavailable'], [429, 'getChat', 'telegram_rate_limited'], [401, 'getFile', 'telegram_token_revoked'], [403, 'getChatMember', 'telegram_source_forbidden'], [403, 'getMe', 'telegram_bot_forbidden'], [400, 'getFile', 'telegram_file_rejected']]) {
      global.fetch = async () => Response.json({ ok: false, error_code: status }, { status });
      await assert.rejects(telegramApi('123456:abcdefghijklmnopqrstuvwxyz_12345', method), new RegExp(code));
    }
  } finally { global.fetch = original; }
});

test('official membership and privacy verification refuses limited groups and private chats', async () => {
  const original = global.fetch;
  const token = '123456:abcdefghijklmnopqrstuvwxyz_12345';
  let type = 'group';
  let status = 'member';
  try {
    global.fetch = async url => Response.json({ ok: true, result: url.endsWith('/getMe') ? { id: 1, is_bot: true } : url.endsWith('/getChat') ? { id: -1001, type } : { status } });
    await assert.rejects(verifyTelegramSource(token, '-1001'), /privacy_mode_limited/);
    status = 'administrator';
    assert.equal((await verifyTelegramSource(token, '-1001')).chatId, '-1001');
    type = 'private';
    await assert.rejects(verifyTelegramSource(token, '-1001'), /unsupported_chat/);
    type = 'channel'; status = 'left';
    await assert.rejects(verifyTelegramSource(token, '-1001'), /bot_not_member/);
  } finally { global.fetch = original; }
});

test('streamed bodies are bounded even without content-length', async () => {
  await assert.rejects(readTelegramBody(new Response('x'.repeat(100)), 10), /payload_too_large/);
});

test('telemetry redacts Bot API URLs, webhook header and Telegram request bodies without mutating input', () => {
  const token = '123456:abcdefghijklmnopqrstuvwxyz_12345';
  const event = {
    message: `Failed https://api.telegram.org/file/bot${token}/photos/a.jpg`,
    breadcrumbs: [{ data: { url: `https://api.telegram.org/bot${token}/getMe` } }],
    request: { url: 'https://events.example/api/admin/telegram', data: { token }, body: 'private text', headers: { 'X-Telegram-Bot-Api-Secret-Token': 'header-secret' } },
  };
  const result = connectionApi.redactTelegramTelemetry(event);
  const json = JSON.stringify(result);
  for (const secret of [token, 'header-secret', 'private text']) assert.ok(!json.includes(secret));
  assert.equal(event.request.data.token, token);
  assert.ok(json.includes('[redacted]'));
});

function moduleWithMocks(path, mocks, appended = '') {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const context = { exports: {}, require: name => {
    if (!(name in mocks)) throw new Error(`Missing mock: ${name}`);
    return mocks[name];
  }, Date, Buffer, URL, Request, Response, Headers, AbortSignal, File, console, process, fetch: (...args) => global.fetch(...args) };
  vm.runInNewContext(compiled + appended, context);
  return context.exports;
}

async function telegramFixture({ realExtraction = false, cropOutput, verifySource, analysisPayload, transcription } = {}) {
  const crypto = await import('node:crypto');
  const sharp = (await import('sharp')).default;
  const connection = { id: 'connection123456789012345', userId: 7, status: 'active', encryptedToken: 'encrypted', webhookSecretHash: telegramSecretHash('fixture-secret') };
  const source = { id: 'source', revision: 1, removedAt: null, connectionId: connection.id, chatId: '-1001', title: 'Source', chatType: 'channel', publicUsername: 'publicchannel', isActive: true, consentedAt: new Date(), verifiedAt: new Date(), connection };
  const jobs = new Map();
  const receipts = new Map();
  const events = [];
  const calendarRows = [];
  const writes = [];
  let publicationFailure = null;
  let duplicate = null;
  let extractFailure = false;
  let beforePublish = () => {};
  const candidate = { title: 'Concerto in piazza', date: '2099-12-20', location: 'Piazza Rossi Schio', time: '21:00', description: '', organizer: '', price: '', category: 'other' };
  const db = {
    $executeRaw: async () => { writes.push('lock'); },
    telegramConnection: {
      findUnique: async ({ where }) => (where.userId && where.userId !== connection.userId) || (where.id && where.id !== connection.id) ? null : { ...connection },
      delete: async () => { writes.push('delete-connection'); jobs.clear(); for (const receipt of receipts.values()) receipt.messageId = null; },
      create: async ({ data }) => { writes.push('create-connection'); Object.assign(connection, data); return { ...connection }; },
      updateMany: async ({ where, data }) => {
        if ((where.id && where.id !== connection.id) || (where.status && where.status !== connection.status)) return { count: 0 };
        writes.push('connection'); Object.assign(connection, data); return { count: 1 };
      },
      update: async ({ data }) => { writes.push('connection'); Object.assign(connection, data); return connection; },
    },
    telegramSource: {
      count: async () => 1,
      findUnique: async () => ({ ...source }),
      findMany: async () => source.isActive && connection.status === 'active' ? [{ ...source, connection: { ...connection } }] : [],
      findFirst: async ({ where }) => where.connectionId === connection.id && where.id === source.id ? source : null,
      updateMany: async ({ where, data }) => {
        if (where.revision !== undefined && where.revision !== source.revision) return { count: 0 };
        writes.push('source'); Object.assign(source, data, data.revision?.increment ? { revision: source.revision + data.revision.increment } : {}); return { count: 1 };
      },
      update: async ({ data }) => { writes.push('source'); Object.assign(source, data, data.revision?.increment ? { revision: source.revision + data.revision.increment } : {}); return { ...source }; },
      upsert: async ({ update }) => db.telegramSource.update({ data: update }),
    },
    telegramMessage: {
      findUnique: async ({ where }) => where.id ? jobs.get(where.id) : [...jobs.values()].find(job => job.sourceId === where.sourceId_messageId.sourceId && job.messageId === where.sourceId_messageId.messageId),
      findFirst: async () => {
        const job = [...jobs.values()].find(job => job.status === 'pending' || (job.status === 'processing' && job.leasedUntil <= new Date()));
        return job ? { ...job } : null;
      },
      upsert: async ({ create, update }) => {
        writes.push('message');
        const existing = [...jobs.values()].find(job => job.messageId === create.messageId);
        if (existing) Object.assign(existing, update, { version: existing.version + 1 });
        else jobs.set('job', { id: 'job', version: 1, publishedCount: 0, discardedCount: 0, ...create });
      },
      updateMany: async ({ where, data }) => {
        writes.push('messages'); let count = 0;
        for (const job of jobs.values()) {
          if (where.id && where.id !== job.id) continue;
          if (where.version && where.version !== job.version) continue;
          if (where.leaseId && where.leaseId !== job.leaseId) continue;
          if (typeof where.status === 'string' && where.status !== job.status) continue;
          if (where.status?.in && !where.status.in.includes(job.status)) continue;
          if (where.id && where.OR && !(job.status === 'pending' || (job.status === 'processing' && job.leasedUntil <= new Date()))) continue;
          if (!where.id && where.OR) {
            if (job.expiresAt > new Date() && !(job.attempts >= 3 && job.leasedUntil <= new Date())) continue;
          }
          Object.assign(job, data, data.attempts?.increment ? { attempts: job.attempts + data.attempts.increment } : {}); count++;
        }
        return { count };
      },
      update: async ({ where, data }) => { writes.push('message'); Object.assign(jobs.get(where.id), data); },
      count: async () => [...jobs.values()].filter(job => ['pending', 'processing'].includes(job.status)).length,
      groupBy: async ({ where }) => { assert.equal(where.source.connection.userId, 7); return []; },
    },
    telegramPublication: {
      findUnique: async ({ where }) => receipts.get(where.fingerprint),
      create: async ({ data }) => {
        if (publicationFailure === 'receipt') throw new Error('injected receipt failure');
        assert.ok(!receipts.has(data.fingerprint)); writes.push('receipt'); receipts.set(data.fingerprint, data);
      },
    },
  };
  let transactionTail = Promise.resolve();
  db.$transaction = async callback => {
    const previous = transactionTail;
    let release;
    transactionTail = new Promise(resolve => { release = resolve; });
    await previous;
    const snapshot = structuredClone({ connection, source, jobs, receipts, events, calendarRows });
    try { return await callback(db); }
    catch (error) {
      for (const key of Object.keys(connection)) delete connection[key];
      Object.assign(connection, snapshot.connection);
      for (const key of Object.keys(source)) delete source[key];
      Object.assign(source, snapshot.source, { connection });
      jobs.clear(); for (const [key, value] of snapshot.jobs) jobs.set(key, value);
      receipts.clear(); for (const [key, value] of snapshot.receipts) receipts.set(key, value);
      events.splice(0, events.length, ...snapshot.events);
      calendarRows.splice(0, calendarRows.length, ...snapshot.calendarRows);
      throw error;
    } finally { release(); }
  };
  const store = moduleWithMocks('./telegram-store.ts', {
    '../app/lib/prisma': { prisma: db }, './telegram-connection': connectionApi,
  });
  const workerMocks = {
    'node:crypto': crypto, sharp: { default: sharp, __esModule: true }, luxon: { DateTime },
    '../app/lib/prisma': { prisma: db }, '../app/lib/google-calendar': { createEventWithCalendar: async ({ data }, tx) => {
      assert.equal(tx, db); writes.push('event+calendar'); const event = { id: events.length + 1, ...data }; events.push(event);
      if (publicationFailure === 'calendar') throw new Error('injected calendar failure');
      calendarRows.push(event.id); return event;
    } },
    './event-duplicates': { findDuplicateEvent: async (_candidate, tx) => { if (tx) assert.equal(tx, db); return duplicate; },
      lockEventDates: async (tx, dates) => { assert.equal(tx, db); for (const date of [...new Set(dates)].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`event-publication:${date}`})::bigint)`; } },
    './vision-ai': { createEventImageAnalyzer: () => async image => image ? (transcription || 'Concerto in piazza, 20 dicembre 2099, Piazza Rossi Schio, 21:00') : JSON.stringify(analysisPayload || { events: [{ ...candidate, evidence: { title: 'Concerto in piazza', date: '20 dicembre 2099', location: 'Piazza Rossi Schio', block: 'Concerto in piazza, 20 dicembre 2099, Piazza Rossi Schio, 21:00' } }] }) },
    './poster-crop': { createVerifiedPosterCrop: async () => cropOutput },
    './event-cover': { normalizeCoverImage: async bytes => bytes }, './telegram-store': store,
    './telegram-connection': { ...connectionApi, decryptTelegramToken: () => '123456:abcdefghijklmnopqrstuvwxyz_12345', verifyTelegramSource: verifySource || (async () => ({ username: 'publicchannel' })) },
  };
  workerMocks['./social-event-extraction'] = moduleWithMocks('./social-event-extraction.ts', workerMocks);
  const worker = moduleWithMocks('./telegram-event-scanning.ts', workerMocks, realExtraction ? '' : '\nextractTelegramEvents = async () => exports.fixtureExtraction();');
  worker.fixtureExtraction = async () => {
    if (extractFailure) throw new Error('private data must never escape');
    await beforePublish();
    return { events: [candidate], discarded: 0, imageUrl: null };
  };
  const payload = (update = 1, text = 'Concerto') => ({ update_id: update, channel_post: { message_id: 1, chat: { id: -1001, type: 'channel' }, text } });
  const ingest = (update = 1, text) => store.ingestTelegramUpdate(connection.id, 'fixture-secret', payload(update, text));
  const adminStore = overrides => moduleWithMocks('./telegram-store.ts', {
    '../app/lib/prisma': { prisma: db }, './telegram-connection': { ...connectionApi, requireTelegramSameOrigin: () => {}, decryptTelegramToken: () => 'fake', ...overrides },
  });
  return { db, store, worker, connection, source, jobs, receipts, events, calendarRows, writes, candidate, payload, ingest, adminStore,
    failPublication: stage => { publicationFailure = stage; },
    setDuplicate: value => { duplicate = value; }, failExtraction: () => { extractFailure = true; },
    beforePublish: callback => { beforePublish = callback; } };
}

test('webhook rejects forged secrets, nonallowed chats and protected/forwarded messages', async () => {
  const state = await telegramFixture();
  await assert.rejects(state.store.ingestTelegramUpdate(state.connection.id, 'forged', state.payload()), /unauthorized/);
  state.source.isActive = false;
  assert.equal((await state.ingest()).accepted, false);
  assert.equal(state.jobs.size, 0);
  state.source.isActive = true;
  const payload = state.payload(); payload.channel_post.has_protected_content = true;
  assert.equal(state.store.parseTelegramUpdate(payload).supported, false);
  delete payload.channel_post.has_protected_content; payload.channel_post.forward_origin = {};
  assert.equal(state.store.parseTelegramUpdate(payload).supported, false);
  payload.channel_post.text = 'x'.repeat(9000); delete payload.channel_post.forward_origin;
  assert.throws(() => state.store.parseTelegramUpdate(payload), /message_too_large/);
});

test('webhook acknowledges only durable writes and updates idempotently without rewriting published messages', async () => {
  const state = await telegramFixture();
  assert.equal((await state.ingest()).accepted, true);
  const job = state.jobs.get('job');
  assert.equal((await state.ingest()).accepted, false);
  await state.ingest(2, 'Edited');
  assert.equal(job.version, 2);
  assert.equal(job.rawText, 'Edited');
  await state.ingest(1, 'Out of order');
  assert.equal(job.rawText, 'Edited');
  job.publishedCount = 1;
  assert.equal((await state.ingest(3, 'Must not overwrite')).accepted, false);
  assert.equal(job.rawText, 'Edited');
  state.db.telegramMessage.upsert = async () => { throw new Error('db unavailable'); };
  job.publishedCount = 0;
  await assert.rejects(state.ingest(3), /db unavailable/);
});

test('unsupported, protected and forwarded edits invalidate pending or in-flight poster versions but never published events', async () => {
  for (const edit of [{ video: {} }, { has_protected_content: true }, { forward_origin: {} }]) {
    for (const inFlight of [false, true]) {
      const state = await telegramFixture();
      const poster = state.payload(); delete poster.channel_post.text;
      Object.assign(poster.channel_post, { caption: 'Poster caption', photo: [{ file_id: 'photo', file_size: 100 }] });
      await state.store.ingestTelegramUpdate(state.connection.id, 'fixture-secret', poster);
      const update = { update_id: 2, edited_channel_post: { message_id: 1, chat: { id: -1001, type: 'channel' }, ...edit } };
      const invalidate = () => state.store.ingestTelegramUpdate(state.connection.id, 'fixture-secret', update);
      if (inFlight) state.beforePublish(invalidate); else await invalidate();
      await state.worker.scanTelegramQueue({ dryRun: false, deadline: Date.now() + 90_000 });
      const job = state.jobs.get('job');
      assert.equal(state.events.length, 0); assert.equal(job.version, 2);
      assert.equal(job.status, 'skipped'); assert.equal(job.rawText, null); assert.equal(job.photoFileId, null); assert.equal(job.leaseId, null);
      assert.equal((await state.ingest(1, 'stale')).accepted, false);
      Object.assign(job, { status: 'published', publishedCount: 1 }); update.update_id = 3;
      assert.equal((await invalidate()).accepted, false); assert.equal(job.version, 2);
    }
  }
});

test('worker creates event, calendar and dedupe receipt in one transaction then removes raw content', async () => {
  const state = await telegramFixture(); await state.ingest();
  const result = await state.worker.scanTelegramQueue({ dryRun: false, deadline: Date.now() + 90_000 });
  assert.equal(result.published, 1);
  assert.equal(state.events[0].sourceUrl, 'https://t.me/publicchannel/1');
  assert.equal(state.events[0].rawText, '');
  assert.equal(state.jobs.get('job').rawText, null);
  assert.equal(state.jobs.get('job').photoFileId, null);
  assert.equal(state.receipts.size, 1);
  assert.ok(state.writes.includes('event+calendar'));
});

test('snapshot transaction rolls back event, calendar and receipt on injected publication failures (not a PostgreSQL lock test)', async () => {
  for (const stage of ['calendar', 'receipt']) {
    const state = await telegramFixture(); await state.ingest();
    const job = state.jobs.get('job'); Object.assign(job, { status: 'processing', leaseId: 'lease', leasedUntil: new Date(Date.now() + 60_000) });
    const extraction = { events: [state.candidate], discarded: 0, imageUrl: null };
    state.failPublication(stage);
    await assert.rejects(state.worker.publishTelegramJob({ ...job }, state.source, 'lease', extraction, null), new RegExp(`injected ${stage} failure`));
    assert.equal(state.events.length, 0); assert.equal(state.calendarRows.length, 0); assert.equal(state.receipts.size, 0);
    assert.equal(state.jobs.get('job').status, 'processing'); assert.equal(state.jobs.get('job').rawText, 'Concerto');
    state.failPublication(null);
    const attempts = await Promise.allSettled([1, 2].map(() => state.worker.publishTelegramJob({ ...state.jobs.get('job') }, state.source, 'lease', extraction, null)));
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(state.events.length, 1); assert.equal(state.calendarRows.length, 1); assert.equal(state.receipts.size, 1);
    await assert.rejects(state.db.telegramPublication.create({ data: [...state.receipts.values()][0] }));
  }
  const sql = readFileSync(new URL('../prisma/migrations/20261029130000_add_telegram_scanning/migration.sql', import.meta.url), 'utf8');
  assert.match(sql, /TelegramPublication_pkey" PRIMARY KEY \("fingerprint"\)/);
});

test('HTTP 500 verification retries only the leased job without revoking source or clearing other messages', async () => {
  const original = global.fetch;
  try {
    global.fetch = async () => Response.json({ ok: false, error_code: 500 }, { status: 500 });
    const state = await telegramFixture({ verifySource: verifyTelegramSource }); await state.ingest();
    state.jobs.set('other', { ...state.jobs.get('job'), id: 'other', messageId: 2 });
    const result = await state.worker.scanTelegramQueue({ dryRun: false, deadline: Date.now() + 90_000 });
    assert.equal(result.retried, 1);
    assert.equal(state.source.isActive, true); assert.equal(state.connection.status, 'active');
    assert.equal(state.jobs.get('other').status, 'pending'); assert.equal(state.jobs.get('other').rawText, 'Concerto');
    assert.equal(state.jobs.get('job').lastError, 'telegram_unavailable');
  } finally { global.fetch = original; }
});

test('getFile 400 omits invalid photo with a valid caption, otherwise fails only that job', async () => {
  const original = global.fetch;
  try {
    global.fetch = async () => Response.json({ ok: false, error_code: 400 }, { status: 400 });
    for (const caption of ['Concerto in piazza, 20 dicembre 2099, Piazza Rossi Schio, 21:00', '']) {
      const state = await telegramFixture({ realExtraction: true }); await state.ingest();
      Object.assign(state.jobs.get('job'), { photoFileId: 'invalid-file', rawText: caption });
      state.jobs.set('other', { ...state.jobs.get('job'), id: 'other', messageId: 2 });
      const result = await state.worker.scanTelegramQueue({ dryRun: false, deadline: Date.now() + 90_000 });
      assert.equal(state.source.isActive, true); assert.equal(state.jobs.get('other').status, 'pending');
      assert.equal(result.published, caption ? 1 : 0); assert.equal(result.failed, caption ? 0 : 1);
      if (caption) assert.equal(state.events[0].imageUrl, null);
    }
  } finally { global.fetch = original; }
});

test('dry-run does not lease, advance cursor, purge, publish or mutate anything', async () => {
  const state = await telegramFixture(); await state.ingest(); state.writes.length = 0;
  const before = JSON.stringify(state.jobs.get('job'), (_key, value) => typeof value === 'bigint' ? String(value) : value);
  const result = await state.worker.scanTelegramQueue({ dryRun: true, deadline: Date.now() + 90_000 });
  assert.equal(result.wouldPublish, 1);
  assert.deepEqual(state.writes, []);
  assert.equal(state.events.length, 0);
  assert.equal(JSON.stringify(state.jobs.get('job'), (_key, value) => typeof value === 'bigint' ? String(value) : value), before);
});

test('deadline reserves the full commit budget and refuses publication after slow AI consumes it', async () => {
  const state = await telegramFixture(); await state.ingest();
  const tooLate = await state.worker.scanTelegramQueue({ dryRun: false, deadline: Date.now() + 16_000 });
  assert.equal(tooLate.visited, 0); assert.equal(state.jobs.get('job').attempts, 0);
  const originalNow = Date.now;
  let now = originalNow(); const deadline = now + 90_000;
  try {
    Date.now = () => now;
    state.beforePublish(() => { now = deadline - 16_000; });
    const result = await state.worker.scanTelegramQueue({ dryRun: false, deadline });
    assert.equal(result.published, 0); assert.equal(result.retried, 1);
    assert.equal(state.events.length, 0); assert.equal(state.jobs.get('job').lastError, 'telegram_budget_exhausted');
  } finally { Date.now = originalNow; }
});

test('revocation and message edits during AI prevent publication using the stale lease', async () => {
  for (const mode of ['pause', 'disconnect', 'edit', 'lease']) {
    const state = await telegramFixture(); await state.ingest();
    state.beforePublish(() => {
      if (mode === 'pause') state.source.isActive = false;
      if (mode === 'disconnect') state.connection.status = 'disconnected';
      if (mode === 'edit') state.jobs.get('job').version++;
      if (mode === 'lease') state.jobs.get('job').leaseId = 'new-worker';
    });
    await state.worker.scanTelegramQueue({ dryRun: false, deadline: Date.now() + 90_000 });
    assert.equal(state.events.length, 0, mode);
  }
});

test('existing event or persistent receipt prevents repeat publication', async () => {
  const state = await telegramFixture(); await state.ingest();
  state.setDuplicate({ id: 99 });
  const result = await state.worker.scanTelegramQueue({ dryRun: false, deadline: Date.now() + 90_000 });
  assert.equal(result.duplicates, 1); assert.equal(state.events.length, 0); assert.equal(state.receipts.size, 1);
  const job = state.jobs.get('job'); job.status = 'processing'; job.leaseId = 'another'; job.leasedUntil = new Date(Date.now() + 60_000);
  state.setDuplicate(null);
  const retry = await state.worker.publishTelegramJob(job, state.source, 'another', { events: [state.candidate], discarded: 0, imageUrl: null }, null);
  assert.equal(retry.duplicates, 1); assert.equal(state.events.length, 0);
});

test('concurrent workers claim a message only once', async () => {
  const state = await telegramFixture(); await state.ingest();
  await Promise.all([state.worker.scanTelegramQueue({ dryRun: false, deadline: Date.now() + 90_000 }), state.worker.scanTelegramQueue({ dryRun: false, deadline: Date.now() + 90_000 })]);
  assert.equal(state.events.length, 1); assert.equal(state.receipts.size, 1);
  assert.equal(state.jobs.get('job').attempts, 1);
});

test('ambiguous webhook registration never marks a bot connected and requires remote cleanup', async () => {
  const state = await telegramFixture(); state.connection.status = 'disconnected';
  const key = process.env.TELEGRAM_ENCRYPTION_KEY;
  const base = process.env.TELEGRAM_WEBHOOK_BASE_URL;
  const origin = process.env.TELEGRAM_ADMIN_ORIGIN;
  const methods = [];
  try {
    process.env.TELEGRAM_ENCRYPTION_KEY = 'ab'.repeat(32);
    process.env.TELEGRAM_WEBHOOK_BASE_URL = 'https://trusted.example';
    process.env.TELEGRAM_ADMIN_ORIGIN = 'https://trusted.example';
    const store = moduleWithMocks('./telegram-store.ts', {
      '../app/lib/prisma': { prisma: state.db },
      './telegram-connection': { ...connectionApi, telegramApi: async (_token, method, parameters) => {
        methods.push(method);
        if (method === 'getMe') return { id: 123456, is_bot: true, username: 'fixture_bot' };
        assert.match(parameters.url, /^https:\/\/trusted\.example\/api\/telegram\/webhook/);
        assert.match(parameters.secret_token, /^[A-Za-z0-9_-]+$/);
        assert.ok(!parameters.url.includes(parameters.secret_token));
        throw new connectionApi.TelegramError('telegram_webhook_failed', 502);
      } },
    });
    await assert.rejects(store.mutateTelegramAdmin(new Request('https://untrusted-origin.example', { method: 'POST', headers: { origin: 'https://trusted.example' }, body: JSON.stringify({ action: 'connect', token: '123456:abcdefghijklmnopqrstuvwxyz_12345' }) }), 7), /telegram_webhook_failed/);
    assert.deepEqual(methods, ['getMe', 'setWebhook']);
    assert.equal(state.connection.status, 'disconnect_unknown');
    assert.ok(state.connection.encryptedToken);
    assert.equal(state.connection.webhookSecretHash, null);
  } finally {
    for (const [name, value] of [['TELEGRAM_ENCRYPTION_KEY', key], ['TELEGRAM_WEBHOOK_BASE_URL', base], ['TELEGRAM_ADMIN_ORIGIN', origin]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('failed reverification disables a previously active source and destroys its pending payload', async () => {
  const state = await telegramFixture(); await state.ingest();
  const previous = process.env.TELEGRAM_ADMIN_ORIGIN;
  try {
    process.env.TELEGRAM_ADMIN_ORIGIN = 'https://events.example';
    const store = moduleWithMocks('./telegram-store.ts', {
      '../app/lib/prisma': { prisma: state.db }, './telegram-connection': { ...connectionApi,
        decryptTelegramToken: () => 'fake', verifyTelegramSource: async () => { throw new connectionApi.TelegramError('privacy_mode_limited'); },
      },
    });
    const request = new Request('https://events.example', { method: 'POST', headers: { origin: 'https://events.example' }, body: JSON.stringify({ action: 'save-source', chatId: '-1001', consent: true }) });
    await assert.rejects(store.mutateTelegramAdmin(request, 7), /privacy_mode_limited/);
    assert.equal(state.source.isActive, false);
    assert.equal(state.jobs.get('job').rawText, null);
  } finally { if (previous === undefined) delete process.env.TELEGRAM_ADMIN_ORIGIN; else process.env.TELEGRAM_ADMIN_ORIGIN = previous; }
});

test('retry is bounded and terminal failures and retention expiry remove raw content', async () => {
  const state = await telegramFixture(); await state.ingest(); state.failExtraction();
  const first = await state.worker.scanTelegramQueue({ dryRun: false, deadline: Date.now() + 90_000 });
  assert.equal(first.retried, 1); assert.equal(state.jobs.get('job').attempts, 1);
  assert.equal(state.jobs.get('job').lastError, 'telegram_processing_unavailable');
  state.jobs.get('job').attempts = 2;
  const last = await state.worker.scanTelegramQueue({ dryRun: false, deadline: Date.now() + 90_000 });
  assert.equal(last.failed, 1); assert.equal(state.jobs.get('job').rawText, null);
  Object.assign(state.jobs.get('job'), { status: 'pending', attempts: 0, rawText: 'expired', expiresAt: new Date(0) });
  await state.worker.scanTelegramQueue({ dryRun: false, deadline: Date.now() + 90_000 });
  assert.equal(state.jobs.get('job').rawText, null); assert.equal(state.jobs.get('job').status, 'failed');
});

const adminRequest = body => new Request('https://events.example/api/admin/telegram', { method: 'POST', body: JSON.stringify(body) });
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('save verification completed after pause or removal cannot reactivate the source', async () => {
  for (const action of ['pause-source', 'remove-source']) {
    const state = await telegramFixture(); const remote = deferred(); const started = deferred();
    const store = state.adminStore({ verifyTelegramSource: () => { started.resolve(); return remote.promise; } });
    const saving = store.mutateTelegramAdmin(adminRequest({ action: 'save-source', chatId: '-1001', consent: true }), 7);
    await started.promise;
    await store.mutateTelegramAdmin(adminRequest({ action, sourceId: 'source' }), 7);
    remote.resolve({ chatId: '-1001', title: 'Verified', chatType: 'channel', username: null });
    await assert.rejects(saving, /source_changed/); assert.equal(state.source.isActive, false);
  }
});

test('worker permission revocation changes source generation and invalidates a concurrent save', async () => {
  const state = await telegramFixture({ verifySource: async () => { throw new connectionApi.TelegramError('telegram_source_forbidden'); } }); await state.ingest();
  const remote = deferred(); const started = deferred();
  const store = state.adminStore({ verifyTelegramSource: () => { started.resolve(); return remote.promise; } });
  const saving = store.mutateTelegramAdmin(adminRequest({ action: 'save-source', chatId: '-1001', consent: true }), 7);
  await started.promise;
  await state.worker.scanTelegramQueue({ dryRun: false, deadline: Date.now() + 90_000 });
  assert.equal(state.source.revision, 2); assert.equal(state.source.isActive, false);
  remote.resolve({ chatId: '-1001', title: 'stale', chatType: 'channel', username: null });
  await assert.rejects(saving, /source_changed/); assert.equal(state.source.isActive, false);
});

test('save verification HTTP 500 preserves source while current auth 401 revokes only the matching connection generation', async () => {
  for (const code of ['telegram_unavailable', 'telegram_token_revoked']) {
    const state = await telegramFixture(); await state.ingest();
    const store = state.adminStore({ verifyTelegramSource: async () => { throw new connectionApi.TelegramError(code); } });
    await assert.rejects(store.mutateTelegramAdmin(adminRequest({ action: 'save-source', chatId: '-1001', consent: true }), 7), new RegExp(code));
    assert.equal(state.connection.status, code === 'telegram_token_revoked' ? 'revoked' : 'active');
    assert.equal(state.source.isActive, code !== 'telegram_token_revoked');
    assert.equal(state.jobs.get('job').rawText, code === 'telegram_token_revoked' ? null : 'Concerto');
  }
});

test('removed sources free a slot without reconnect, paused sources count and removal is not an error-string sentinel', async () => {
  const state = await telegramFixture();
  state.db.telegramSource.findUnique = async ({ where }) => where.id || where.connectionId_chatId.chatId === state.source.chatId ? { ...state.source } : null;
  state.db.telegramSource.count = async ({ where }) => {
    assert.equal(where.removedAt, null);
    return state.source.removedAt ? 49 : 50;
  };
  state.db.telegramSource.upsert = async ({ create }) => { Object.assign(state.source, create); return { ...state.source }; };
  const store = state.adminStore({ verifyTelegramSource: async (_token, chatId) => ({ chatId, title: 'New source', chatType: 'channel', username: null }) });
  const save = () => store.mutateTelegramAdmin(adminRequest({ action: 'save-source', chatId: '-1002', consent: true }), 7);
  await assert.rejects(save(), /source_limit/);
  await store.mutateTelegramAdmin(adminRequest({ action: 'pause-source', sourceId: 'source' }), 7);
  await assert.rejects(save(), /source_limit/);
  await store.mutateTelegramAdmin(adminRequest({ action: 'remove-source', sourceId: 'source' }), 7);
  assert.ok(state.source.removedAt); state.source.lastError = 'different_error';
  await save(); assert.equal(state.source.isActive, true); assert.equal(state.source.removedAt, null);
  assert.equal(state.connection.status, 'active');
});

test('stale save errors and worker failures do not disable a reauthorized source or its new queue', async () => {
  for (const mode of ['save', 'worker']) {
    const remote = deferred(); const started = deferred();
    const state = await telegramFixture({ verifySource: () => { started.resolve(); return remote.promise; } }); await state.ingest();
    const store = state.adminStore({ verifyTelegramSource: () => { started.resolve(); return remote.promise; } });
    const running = mode === 'save' ? store.mutateTelegramAdmin(adminRequest({ action: 'save-source', chatId: '-1001', consent: true }), 7) :
      state.worker.scanTelegramQueue({ dryRun: false, deadline: Date.now() + 90_000 });
    await started.promise;
    await store.mutateTelegramAdmin(adminRequest({ action: 'pause-source', sourceId: 'source' }), 7);
    const newStore = state.adminStore({ verifyTelegramSource: async () => ({ chatId: '-1001', title: 'Again', chatType: 'channel', username: null }) });
    await newStore.mutateTelegramAdmin(adminRequest({ action: 'save-source', chatId: '-1001', consent: true }), 7);
    await state.ingest(2, 'new acquisition');
    remote.reject(new connectionApi.TelegramError('privacy_mode_limited'));
    if (mode === 'save') await assert.rejects(running, /privacy_mode_limited/); else await running;
    assert.equal(state.source.isActive, true); assert.equal(state.jobs.get('job').rawText, 'new acquisition'); assert.equal(state.jobs.get('job').status, 'pending');
  }
});

test('evidence rejects invented dates, invalid calendar days, missing fields, past or private events', async () => {
  const state = await telegramFixture();
  const text = 'Concerto in piazza, 20 dicembre 2099, Piazza Rossi Schio, 21:00';
  const item = { ...state.candidate, evidence: { title: 'Concerto in piazza', date: '20 dicembre 2099', location: 'Piazza Rossi Schio', block: text } };
  assert.equal(state.worker.telegramCandidates({ events: [item] }, text).events.length, 1);
  for (const patch of [{ date: '2099-12-21' }, { date: '2099-02-31' }, { date: '2020-12-20' }, { location: '' }, { title: 'Invented concert' }]) {
    assert.equal(state.worker.telegramCandidates({ events: [{ ...item, ...patch }] }, text).events.length, 0);
  }
  assert.equal(state.worker.telegramCandidates({ events: [item] }, `${text} festa privata`).events.length, 0);
  const mixed = `${text}. Altro evento, 21 dicembre 2099`;
  assert.equal(state.worker.telegramCandidates({ events: [{ ...item, evidence: { ...item.evidence, block: mixed } }] }, mixed).events.length, 0);
  assert.equal(state.worker.telegramPublicSource(null, 'channel', 1), null);
  assert.equal(state.worker.telegramPublicSource('username', 'supergroup', 1), null);
});

test('private source publication never exposes chat ids or private t.me/c links', async () => {
  const state = await telegramFixture(); await state.ingest();
  const job = state.jobs.get('job'); Object.assign(job, { status: 'processing', leaseId: 'lease', leasedUntil: new Date(Date.now() + 60_000) });
  await state.worker.publishTelegramJob(job, state.source, 'lease', { events: [state.candidate], discarded: 0, imageUrl: null }, null);
  assert.equal(state.events[0].sourceUrl, null);
  assert.ok(!JSON.stringify(state.events).includes('-1001'));
});

test('candidate evidence handles hyphenated dates, punctuation and cancellation scoped to one paragraph', async () => {
  const state = await telegramFixture();
  const item = (title, date, location, block) => ({ ...state.candidate, title, location, evidence: { title, date, location, block } });
  const first = 'Concerto in piazza, 20-12-2099, Piazza Rossi Schio, evento annullato';
  const second = 'Mostra di pittura, 20-12-2099, Palazzo Fogazzaro Schio';
  const cancelled = item('Concerto in piazza', '20-12-2099', 'Piazza Rossi Schio', first);
  const valid = item('Mostra di pittura', '20-12-2099', 'Palazzo Fogazzaro Schio', second);
  const mixed = `${first}\n\n${second}`;
  const result = state.worker.telegramCandidates({ events: [cancelled, valid] }, mixed);
  assert.equal(result.events.length, 1); assert.equal(result.events[0].title, valid.title);
  assert.equal(state.worker.telegramCandidates({ events: [valid] }, `${mixed}\n\nTutti gli eventi sono annullati`).events.length, 0);
  assert.equal(state.worker.telegramCandidates({ events: [valid] }, 'Tutti gli eventi sono annullati').events.length, 0);
  const confused = `${second}, altra data 21 dicembre 2099`;
  assert.equal(state.worker.telegramCandidates({ events: [{ ...valid, date: '2099-12-21', evidence: { ...valid.evidence, date: '21 dicembre 2099', block: confused } }] }, confused).events.length, 0);
  for (const field of ['title', 'location']) {
    const block = `${second} --`;
    assert.equal(state.worker.telegramCandidates({ events: [{ ...valid, [field]: '--', evidence: { ...valid.evidence, [field]: '--', block } }] }, block).events.length, 0);
  }
});

test('multi-event poster never reuses a cover verified for only the first event', async () => {
  const original = global.fetch;
  const sharp = (await import('sharp')).default;
  const photo = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#db2345' } }).jpeg().toBuffer();
  const items = ['Concerto in piazza', 'Mostra di pittura'].map(title => {
    const block = `${title}, 20 dicembre 2099, Piazza Rossi Schio`;
    return { title, date: '2099-12-20', location: 'Piazza Rossi Schio', evidence: { title, date: '20 dicembre 2099', location: 'Piazza Rossi Schio', block } };
  });
  try {
    global.fetch = async url => String(url).endsWith('/getFile') ? Response.json({ ok: true, result: { file_path: 'photos/poster.jpg', file_size: photo.length } }) : new Response(photo);
    const state = await telegramFixture({ realExtraction: true, cropOutput: photo, analysisPayload: { events: items }, transcription: items.map(item => item.evidence.block).join('\n\n') });
    const extraction = await state.worker.extractTelegramEvents({ rawText: '', photoFileId: 'file' }, '123456:abcdefghijklmnopqrstuvwxyz_12345', AbortSignal.timeout(10_000));
    assert.equal(extraction.events.length, 2); assert.equal(extraction.imageUrl, null);
    await state.ingest(); const job = state.jobs.get('job');
    Object.assign(job, { status: 'processing', leaseId: 'lease', leasedUntil: new Date(Date.now() + 60_000) });
    await state.worker.publishTelegramJob(job, state.source, 'lease', { ...extraction, imageUrl: 'unverified-for-second-event' }, null);
    assert.equal(state.events.length, 2); assert.ok(state.events.every(event => event.imageUrl === null));
  } finally { global.fetch = original; }
});

test('admin GET is an allowlisted owner-scoped projection with no credentials or connection identifier', async () => {
  const state = await telegramFixture();
  const dto = await state.store.getTelegramAdminStatus(7);
  const json = JSON.stringify(dto);
  for (const secret of ['encryptedToken', 'webhookSecretHash', 'encrypted', state.connection.id]) assert.ok(!json.includes(secret));
});

test('admin routes deny anonymous and nonadmins, including the legacy email-prefix exception', async () => {
  for (const kind of ['anonymous', 'user', 'admin']) {
    const calls = [];
    const route = moduleWithMocks('../app/api/admin/telegram/route.ts', {
      'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
      '../../../lib/auth-helpers': { withAuth: handler => kind === 'anonymous' ? Response.json({ error: 'Non autorizzato' }, { status: 401 }) : handler(7) },
      '../../../lib/prisma': { prisma: { user: { findUnique: async () => ({ role: kind, type: kind, email: 'andreacazzola90@untrusted.example' }) } } },
      '../../../../lib/telegram-store': {
        getTelegramAdminStatus: async id => { calls.push(id); return { connected: false }; },
        mutateTelegramAdmin: async (_request, id) => { calls.push(id); return { connected: false }; },
      },
      '../../../../lib/telegram-connection': connectionApi,
    });
    const expected = kind === 'anonymous' ? 401 : kind === 'user' ? 403 : 200;
    assert.equal((await route.GET()).status, expected);
    assert.equal((await route.POST(new Request('https://events.example'))).status, expected);
    assert.deepEqual(calls, kind === 'admin' ? [7, 7] : []);
  }
});

test('owner isolation, same-origin and disconnect prevent further queue use', async () => {
  const state = await telegramFixture(); await state.ingest();
  const previous = process.env.TELEGRAM_ADMIN_ORIGIN;
  try {
    process.env.TELEGRAM_ADMIN_ORIGIN = 'https://events.example';
    const request = body => new Request('https://events.example/api/admin/telegram', { method: 'POST', headers: { origin: 'https://events.example' }, body: JSON.stringify(body) });
    await assert.rejects(state.store.mutateTelegramAdmin(request({ action: 'disconnect' }), 8), /telegram_not_connected/);
    await assert.rejects(state.store.mutateTelegramAdmin(new Request('https://events.example', { method: 'POST', body: '{}' }), 7), /same_origin_required/);
    await assert.rejects(state.store.mutateTelegramAdmin(request({ action: 'pause-source', sourceId: 'other-owner-source' }), 7), /source_not_found/);
    assert.equal(state.source.isActive, true);
    const result = await state.store.mutateTelegramAdmin(request({ action: 'disconnect' }), 7);
    assert.equal(result.connected, false);
    assert.equal(state.connection.status, 'disconnect_unknown');
    assert.equal(result.remoteRemoved, false);
    assert.ok(state.connection.encryptedToken);
    assert.equal(state.connection.webhookSecretHash, null);
    assert.equal(state.jobs.get('job').rawText, null);
    assert.equal(state.jobs.get('job').status, 'skipped');
    await assert.rejects(state.ingest(2), /unauthorized/);
  } finally { if (previous === undefined) delete process.env.TELEGRAM_ADMIN_ORIGIN; else process.env.TELEGRAM_ADMIN_ORIGIN = previous; }
});

test('webhook route enforces secret header, size, JSON and reports failed persistence honestly', async () => {
  const route = moduleWithMocks('../app/api/telegram/webhook/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '../../../../lib/telegram-connection': connectionApi,
    '../../../../lib/telegram-store': { ingestTelegramUpdate: async () => { throw new Error('private storage detail'); } },
  });
  const url = 'https://events.example/api/telegram/webhook?connection=connection123456789012345';
  assert.equal((await route.POST(new Request(url, { method: 'POST', body: '{}' }))).status, 401);
  const headers = { 'X-Telegram-Bot-Api-Secret-Token': 'fake', 'Content-Type': 'application/json' };
  assert.equal((await route.POST(new Request(url, { method: 'POST', headers, body: 'x'.repeat(70_000) }))).status, 413);
  assert.equal((await route.POST(new Request(url, { method: 'POST', headers, body: 'not json' }))).status, 400);
  const response = await route.POST(new Request(url, { method: 'POST', headers, body: '{}' }));
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('private storage detail'));
});

test('disconnect blocks same-bot reconnect until deleteWebhook completes, including ambiguous failures', async () => {
  for (const fail of [false, true]) {
    const state = await telegramFixture(); const remote = deferred(); const started = deferred(); const calls = [];
    let firstDelete = true;
    const store = state.adminStore({
      encryptTelegramToken: () => 'encrypted', telegramWebhookUrl: id => `https://events.example/api/telegram/webhook?connection=${id}`,
      telegramApi: async (_token, method) => {
        calls.push(method);
        if (method === 'getMe') return { id: 123456, is_bot: true, username: 'fixture_bot' };
        if (method === 'deleteWebhook' && firstDelete) { firstDelete = false; started.resolve(); return remote.promise; }
        return true;
      },
    });
    const disconnecting = store.mutateTelegramAdmin(adminRequest({ action: 'disconnect' }), 7);
    await started.promise;
    await assert.rejects(store.mutateTelegramAdmin(adminRequest({ action: 'connect', token: 'mock' }), 7), /disconnect_first/);
    assert.ok(!calls.includes('setWebhook')); assert.equal(state.connection.status, 'disconnecting');
    if (fail) remote.reject(new Error('timeout')); else remote.resolve(true);
    const result = await disconnecting;
    assert.equal(result.remoteRemoved, !fail);
    if (fail) {
      assert.equal(state.connection.status, 'disconnect_unknown'); assert.ok(state.connection.encryptedToken);
      await assert.rejects(store.mutateTelegramAdmin(adminRequest({ action: 'connect', token: 'mock' }), 7), /disconnect_first/);
      await store.mutateTelegramAdmin(adminRequest({ action: 'disconnect' }), 7);
    }
    await store.mutateTelegramAdmin(adminRequest({ action: 'connect', token: 'mock' }), 7);
    assert.equal(state.connection.status, 'active'); assert.equal(calls.at(-1), 'setWebhook');
  }
});

test('opaque tombstone survives connection deletion and reconnect even after the event was deleted', async () => {
  const state = await telegramFixture(); await state.ingest();
  await state.worker.scanTelegramQueue({ dryRun: false, deadline: Date.now() + 90_000 });
  state.events.length = 0;
  for (const receipt of state.receipts.values()) receipt.eventId = null;
  const store = state.adminStore({ encryptTelegramToken: () => 'encrypted', telegramWebhookUrl: () => 'https://events.example/webhook',
    newTelegramSecret: () => 'fixture-secret',
    telegramApi: async (_token, method) => method === 'getMe' ? { id: 999999, is_bot: true, username: 'other_bot' } : true });
  await store.mutateTelegramAdmin(adminRequest({ action: 'disconnect' }), 7);
  await store.mutateTelegramAdmin(adminRequest({ action: 'connect', token: 'mock' }), 7);
  assert.equal(state.jobs.size, 0); assert.equal(state.receipts.size, 1);
  assert.equal([...state.receipts.values()][0].messageId, null);
  Object.assign(state.source, { connectionId: state.connection.id, isActive: true, consentedAt: new Date() });
  await state.ingest(2);
  const result = await state.worker.scanTelegramQueue({ dryRun: false, deadline: Date.now() + 90_000 });
  assert.equal(result.duplicates, 1); assert.equal(state.events.length, 0);
  const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  assert.match(schema, /message\s+TelegramMessage\?[^\n]+onDelete: SetNull/);
  const sql = readFileSync(new URL('../prisma/migrations/20261029130000_add_telegram_scanning/migration.sql', import.meta.url), 'utf8');
  assert.match(sql, /TelegramPublication_messageId_fkey[^;]+ON DELETE SET NULL/);
});

test('real photo extraction handles caption and poster text but never falls back to original cover or token URL', async () => {
  const original = global.fetch;
  const sharp = (await import('sharp')).default;
  const photo = await sharp({ create: { width: 200, height: 300, channels: 3, background: '#db2345' } }).jpeg().toBuffer();
  const token = '123456:abcdefghijklmnopqrstuvwxyz_12345';
  try {
    global.fetch = async url => String(url).endsWith('/getFile') ? Response.json({ ok: true, result: { file_path: 'photos/poster.jpg', file_size: photo.length } }) : new Response(photo);
    for (const cropOutput of [undefined, photo]) {
      const state = await telegramFixture({ realExtraction: true, cropOutput });
      const result = await state.worker.extractTelegramEvents({ rawText: 'Caption', photoFileId: 'file' }, token, AbortSignal.timeout(10_000));
      assert.equal(result.events.length, 1);
      if (!cropOutput) assert.equal(result.imageUrl, null);
      else assert.match(result.imageUrl, /^data:image\/jpeg;base64,/);
      assert.ok(!JSON.stringify(result).includes(token));
      assert.ok(!JSON.stringify(result).includes('api.telegram.org'));
    }
    global.fetch = async url => { throw new Error(`Failed at ${url}`); };
    const state = await telegramFixture();
    await assert.rejects(state.worker.downloadTelegramPhoto(token, 'file', AbortSignal.timeout(100)), /telegram_unavailable/);
    global.fetch = async url => String(url).endsWith('/getFile') ? Response.json({ ok: true, result: { file_path: 'photos/poster.jpg', file_size: photo.length } }) : Promise.reject(new Error(`Failed at ${url}`));
    await assert.rejects(state.worker.downloadTelegramPhoto(token, 'file', AbortSignal.timeout(100)), error => error.message === 'telegram_photo_unavailable' && !error.cause);
  } finally { global.fetch = original; }
});