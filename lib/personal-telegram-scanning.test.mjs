import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as policy from './personal-telegram-policy.ts';

const source = readFileSync(new URL('./personal-telegram-scanning.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = { exports: {} };
const database = {};
const social = {};
const tesseract = { createWorker: async () => ({}) };
let mockTime = Date.now();
class TestDate extends Date {
  constructor(...args) { super(...(args.length ? args : [mockTime])); }
  static now() { return mockTime; }
}
vm.runInNewContext(compiled, {
  exports: loaded.exports, module: loaded, Buffer, Date: TestDate, Map, Promise, Uint8Array,
  process: { cwd: () => '/repo' },
  AbortSignal: { timeout: () => ({ throwIfAborted() {} }) },
  require: name => {
    if (name === 'node:crypto') return { randomUUID: () => 'fixture-lease' };
    if (name === 'tesseract.js') return tesseract;
    if (name.endsWith('/app/lib/prisma')) return { prisma: database };
    if (name.endsWith('personal-messaging')) return {
      workerConfiguration: () => ({}),
      MessagingError: class extends Error { constructor(code, status) { super(code); this.status = status; } },
    };
    if (name.endsWith('personal-telegram-policy')) return policy;
    if (name.endsWith('social-event-extraction')) return social;
    throw new Error(`Unexpected dependency ${name}`);
  },
});
const { assertCurrentPersonalGrant, persistThenAcknowledge, personalTelegramScanTestHelpers, syncPersonalMessagingStatus, cleanupExpiredPersonalTelegramMessages } = loaded.exports;

function fenceFixture(active = true) {
  const calls = [];
  const tx = {
    $executeRaw: async () => { calls.push('lock'); return 1; },
    personalMessagingAccount: { findUnique: async () => ({ ownerId: 1, status: 'connected' }) },
    user: { findUnique: async () => ({ role: 'admin' }) },
    personalMessagingSource: { findUnique: async () => ({
      id: 'source', active, revision: 7, workerRevision: 2, consentedAt: new Date(),
    }) },
    personalTelegramScanMessage: { findUnique: async () => ({
      id: 'job', sourceRevision: 7, status: 'processing', leaseId: 'lease',
      leasedUntil: new Date(Date.now() + 60_000), expiresAt: new Date(Date.now() + 60_000),
    }) },
  };
  const job = { id: 'job', sourceId: 'source', sourceRevision: 7, leaseId: 'lease', source: { accountId: 'account', workerRevision: 2 } };
  return { tx, job, calls };
}

test('message queue commits before cursor acknowledgement; failed commit never advances it', async () => {
  const order = [];
  await persistThenAcknowledge(91, async () => { order.push('commit'); return 3; }, async cursor => { order.push(`ack:${cursor}`); });
  assert.deepEqual(order, ['commit', 'ack:91']);
  await assert.rejects(persistThenAcknowledge(92, async () => { throw new Error('database unavailable'); }, async () => { order.push('unexpected-ack'); }));
  assert.deepEqual(order, ['commit', 'ack:91']);
});

test('publication fence requires the current connected, consented, leased grant', async () => {
  const valid = fenceFixture();
  await assertCurrentPersonalGrant(valid.tx, valid.job);
  assert.deepEqual(valid.calls, ['lock', 'lock', 'lock']);
  const revoked = fenceFixture(false);
  await assert.rejects(assertCurrentPersonalGrant(revoked.tx, revoked.job), /personal_telegram_job_changed/);
  const demoted = fenceFixture();
  demoted.tx.user.findUnique = async () => ({ role: 'user', type: 'user' });
  await assert.rejects(assertCurrentPersonalGrant(demoted.tx, demoted.job), /personal_telegram_job_changed/);
});

test('only filtered announcement excerpts leave the worker batch for the extraction pipeline', async () => {
  const candidate = await personalTelegramScanTestHelpers.announcement({
    id: 8,
    text: 'Concerto pubblico 12 giugno 2027 presso Teatro Comunale\nContatto @private +39 333 1234567',
  });
  assert.match(candidate.text, /Concerto pubblico/);
  assert.doesNotMatch(candidate.text, /@private|333 1234567/);
  assert.equal(await personalTelegramScanTestHelpers.announcement({ id: 9, text: 'Messaggio privato, ci vediamo stasera' }), '');
});

test('photo OCR is local, combines with incomplete captions, and supports photo-only event posters', async () => {
  const photo = Buffer.from('fixture poster').toString('base64');
  const calls = [];
  const recognize = async bytes => {
    calls.push(bytes.toString());
    return 'Festival 12 giugno 2027 presso Teatro Comunale';
  };
  const captionAndPoster = await personalTelegramScanTestHelpers.announcement({
    id: 10, text: 'Festival della musica', photo,
  }, recognize);
  assert.match(captionAndPoster.text, /Festival della musica/);
  assert.match(captionAndPoster.text, /12 giugno 2027 presso Teatro Comunale/);
  assert.deepEqual(calls, ['fixture poster']);
  const posterOnly = await personalTelegramScanTestHelpers.announcement({ id: 11, text: '', photo }, recognize);
  assert.match(posterOnly.text, /Teatro Comunale/);
  assert.doesNotMatch(posterOnly.text, /fixture poster/);
  assert.equal(await personalTelegramScanTestHelpers.announcement({
    id: 12, text: 'Festa privata', photo,
  }, async () => 'Evento privato 12 giugno 2027 presso Teatro Comunale'), '');
  assert.equal(await personalTelegramScanTestHelpers.announcement({
    id: 12, text: 'Solo invitati', photo,
  }, async () => 'Festival pubblico 12 giugno 2027 presso Teatro Comunale'), '');
});

test('local OCR errors become a sanitized retryable processing error', async () => {
  await assert.rejects(personalTelegramScanTestHelpers.announcement({
    id: 13, text: '', photo: Buffer.from('poster').toString('base64'),
  }, async () => { throw new Error('private file path must not escape'); }), /personal_telegram_ocr_failed/);
});

test('dry-run reports OCR failures instead of silently counting them as ordinary discards', async () => {
  tesseract.createWorker = async () => { throw new Error('private local OCR configuration'); };
  const result = await personalTelegramScanTestHelpers.classifyDryRun([{
    id: 14, text: '', photo: Buffer.from('poster').toString('base64'),
  }], mockTime + 10_000);
  assert.equal(result.ocrErrors, 1);
  assert.equal(result.discarded, 0);
  assert.equal(result.wouldPublish, 0);
});

test('status polls preserve scan errors until a successful reauthorization', async () => {
  const sourceRow = {
    id: 'source', accountId: 'account', providerId: 'group:supergroup:1', active: true,
    workerRevision: 2, revision: 4, consentedAt: new Date(mockTime - 1000), lastError: 'telegram_flood_wait',
  };
  database.$transaction = async callback => callback({
    $executeRaw: async () => {},
    personalMessagingAccount: {
      upsert: async () => ({ id: 'account', revision: 1 }),
      findUnique: async () => ({ id: 'account', revision: 1 }),
    },
    personalMessagingSource: {
      findMany: async () => [sourceRow],
      update: async ({ data }) => {
        Object.assign(sourceRow, { ...data, revision: data.revision?.increment ? sourceRow.revision + data.revision.increment : data.revision });
      },
    },
    personalTelegramScanMessage: { updateMany: async () => ({ count: 0 }) },
  });
  const status = (revision, consentedAt) => ({
    status: 'connected',
    sources: [{ id: sourceRow.providerId, title: 'Group', kind: 'group', active: true, revision, consentedAt }],
  });
  await syncPersonalMessagingStatus(1, status(2, sourceRow.consentedAt.toISOString()));
  assert.equal(sourceRow.lastError, 'telegram_flood_wait');
  await syncPersonalMessagingStatus(1, { ...status(2, sourceRow.consentedAt.toISOString()), status: 'restoring' });
  assert.equal(sourceRow.active, true, 'a transport outage suspends publication without erasing consent');
  assert.equal(sourceRow.revision, 4);
  await syncPersonalMessagingStatus(1, status(2, sourceRow.consentedAt.toISOString()));
  assert.equal(sourceRow.active, true);
  await syncPersonalMessagingStatus(1, status(3, new Date(mockTime).toISOString()));
  assert.equal(sourceRow.lastError, null);
  sourceRow.active = false;
  await syncPersonalMessagingStatus(1, status(3, sourceRow.consentedAt.toISOString()));
  assert.equal(sourceRow.active, false, 'polling cannot reenable a paused grant');
  await assert.rejects(syncPersonalMessagingStatus(1, status(3, new Date(mockTime).toISOString()), {
    authorized: true, expectedRevision: 0,
  }), /operation_cancelled/);
});

test('retention cleanup clears expired queue payloads and leaves unexpired records alone', async () => {
  let query;
  const cleared = await cleanupExpiredPersonalTelegramMessages({
    personalTelegramScanMessage: { updateMany: async value => { query = value; return { count: 2 }; } },
  }, new Date('2026-11-08T12:00:00Z'));
  assert.equal(cleared, 2);
  assert.deepEqual(Array.from(query.where.status.in), ['pending', 'processing']);
  assert.equal(query.where.expiresAt.lte.toISOString(), '2026-11-08T12:00:00.000Z');
  assert.equal(query.data.rawText, '');
  assert.equal(query.data.photoBytes, null);
  assert.equal(query.data.status, 'failed');
});

test('a publication committed past its budget remains successful, not retried as a failure', async () => {
  mockTime = Date.now();
  const job = {
    id: 'job', sourceId: 'source', providerMessageId: 99, sourceRevision: 4, leaseId: 'lease',
    rawText: 'Festival della musica', photoBytes: Uint8Array.from(Buffer.from('fixture poster')),
    attempts: 1, expiresAt: new Date(mockTime + 60_000),
    source: { accountId: 'account', workerRevision: 2 },
  };
  const sourceRow = {
    id: 'source', accountId: 'account', active: true, revision: 4, workerRevision: 2, consentedAt: new Date(mockTime),
  };
  let committedStatus;
  let localImage;
  tesseract.createWorker = async (language, workers, options) => {
    assert.equal(language, 'ita');
    assert.equal(workers, 1);
    assert.equal(options.langPath, '/repo');
    return {
      recognize: async bytes => { localImage = bytes; return { data: { text: 'Festival 12 giugno 2027 presso Teatro Comunale' } }; },
      terminate: async () => {},
    };
  };
  let extractionInput;
  social.extractSocialEvents = async input => {
    extractionInput = input;
    return { events: [{ title: 'Festival' }], discarded: 0, imageUrl: null };
  };
  social.publishSocialEvents = async () => ({ published: 1, duplicates: 0 });
  database.personalMessagingSource = { findUnique: async () => sourceRow };
  database.$transaction = async callback => {
    const tx = {
      $executeRaw: async () => {},
      personalMessagingAccount: { findUnique: async () => ({ ownerId: 1, status: 'connected' }) },
      user: { findUnique: async () => ({ role: 'admin' }) },
      personalMessagingSource: { findUnique: async () => sourceRow, update: async () => {} },
      personalTelegramScanMessage: {
        findUnique: async () => ({ ...job, status: 'processing', leasedUntil: new Date(mockTime + 60_000) }),
        update: async ({ data }) => { committedStatus = data.status; },
      },
      personalTelegramScanPublication: { findUnique: async () => null, create: async () => {} },
    };
    const result = await callback(tx);
    mockTime += 20_000;
    return result;
  };
  const result = await personalTelegramScanTestHelpers.publishPersonalMessage(job, mockTime + 10_000);
  assert.equal(result.published, 1);
  assert.equal(committedStatus, 'published');
  assert.equal(localImage.toString(), 'fixture poster');
  assert.match(extractionInput.text, /Festival della musica/);
  assert.match(extractionInput.text, /12 giugno 2027 presso Teatro Comunale/);
  assert.deepEqual(Object.keys(extractionInput).sort(), ['fail', 'signal', 'text']);
  assert.ok(!JSON.stringify(extractionInput).includes('fixture poster'));
});
