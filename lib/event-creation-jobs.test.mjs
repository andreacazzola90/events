import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import sharp from 'sharp';
import { NextRequest, NextResponse } from 'next/server.js';

const require = createRequire(import.meta.url);
const policy = await import('./event-creation-job-policy.ts');
const id = '99339bb4-b3aa-41c5-8535-770b1905e59d';
const secret = 'a'.repeat(64);
const upload = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#ec1342' } }).png().toBuffer();
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const routeCode = compile('../app/api/event-creation-jobs/route.ts');
const statusCode = compile('../app/api/event-creation-jobs/[id]/route.ts');
const workerCode = compile('./event-creation-worker.ts');

function load(code, modules) {
  const context = {
    exports: {}, AbortSignal, Buffer, Date, Error, File, Uint8Array, URL, performance, process: { env: {} },
    console: { warn() {} },
    require(name) {
      if (Object.hasOwn(modules, name)) return modules[name];
      if (name.endsWith('/event-creation-job-policy') || name === './event-creation-job-policy') return policy;
      if (name === 'sharp') return { default: sharp };
      if (name === 'server-only') return {};
      if (name.startsWith('node:')) return require(name);
      throw new Error(`Unexpected import ${name}`);
    },
  };
  vm.runInNewContext(code, context);
  return context.exports;
}

test('returns a measurable quick receipt after a durable insert, independent of the worker; retries preserve the row', async t => {
  const after = [];
  let saved;
  const tx = {
    $executeRaw: async () => {},
    eventCreationJob: {
      findUnique: async () => saved,
      count: async () => 0,
      create: async ({ data }) => { saved = { ...data, status: 'queued' }; },
    },
  };
  const access = {
    jobOwnerId: async () => null,
    jobResponse: (body, status, headers) => NextResponse.json(body, { status, headers }),
  };
  let kickCount = 0;
  const route = load(routeCode, {
    'next/server': { after: task => after.push(task) },
    '../../../lib/event-creation-worker': { kickEventCreationJob: async () => { kickCount++; } },
    '../../../lib/event-creation-job-access': access,
    '@/lib/prisma': { prisma: { $transaction: operation => operation(tx) } },
  });
  const request = (key = secret, bytes = upload) => new NextRequest('https://events.test/api/event-creation-jobs', {
    method: 'POST', body: bytes,
    headers: { 'Content-Type': 'image/png', 'Idempotency-Key': id, 'X-Event-Job-Secret': key },
  });
  const response = await route.POST(request());
  assert.equal(response.status, 202);
  assert.match(response.headers.get('server-timing'), /^enqueue;dur=\d+\.\d$/);
  t.diagnostic(`Local mocked PostgreSQL enqueue: ${response.headers.get('server-timing')}`);
  assert.deepEqual(await response.json(), { id, status: 'queued' });
  assert.equal(kickCount, 0);
  assert.equal(after.length, 1);
  assert.equal(saved.secretHash, policy.jobHash(secret));
  assert.deepEqual(Buffer.from(saved.input), upload);
  const initial = saved;
  assert.equal((await route.POST(request())).status, 202);
  assert.equal(saved, initial);
  assert.equal((await route.POST(request('b'.repeat(64)))).status, 404);
  assert.equal((await route.POST(request(secret, await sharp(upload).negate().png().toBuffer()))).status, 409);
  assert.equal((await route.POST(request(secret, Buffer.alloc(policy.MAX_JOB_IMAGE_BYTES + 1)))).status, 413);
});

test('job access requires its owner or its anonymous capability and rechecks publication before linking', async () => {
  let owner = null;
  let job = { ownerId: null, secretHash: policy.jobHash(secret), status: 'review', inputExpiresAt: new Date(Date.now() + 60_000), outcome: { reason: 'duplicate', events: [] } };
  let reads = 0;
  const privateJobHeaders = { 'Cache-Control': 'private, no-store' };
  const route = load(statusCode, {
    'next/server': { NextResponse },
    '../../../../lib/event-creation-job-access': {
      privateJobHeaders, jobOwnerId: async () => owner,
      jobResponse: (body, status) => NextResponse.json(body, { status, headers: privateJobHeaders }),
    },
    '../../../../lib/slug-utils': { generateUniqueSlug: () => 'visible-42' },
    '@/lib/prisma': { prisma: {
      eventCreationJob: { findUnique: async ({ select }) => {
        if (!select.input) return job;
        reads++;
        return { input: upload, mimeType: 'image/png' };
      } },
      event: { findMany: async ({ where }) => { assert.equal(where.isPublished, true); return []; } },
    } },
  });
  const get = (key, suffix = '') => route.GET(new NextRequest(`https://events.test/api/event-creation-jobs/${id}${suffix}`, {
    headers: key ? { 'X-Event-Job-Secret': key } : undefined,
  }), { params: Promise.resolve({ id }) });
  assert.equal((await get(null, '?input=1')).status, 404);
  assert.equal(reads, 0);
  assert.equal((await get(secret, '?input=1')).headers.get('cache-control'), 'private, no-store');
  assert.equal(reads, 1);
  job = { ...job, ownerId: 42, secretHash: null, status: 'published', outcome: { events: [{ index: 0, status: 'published', eventId: 42, slug: 'now-private' }] } };
  assert.equal((await get(secret)).status, 404);
  owner = 42;
  const result = await (await get(null)).json();
  assert.equal(result.events[0].slug, undefined);
  assert.equal((await get(null, '?input=1')).status, 404);
});

test('a crashed lease is reclaimed once; approved covers are published once and invalidated after commit', async () => {
  let status = 'processing';
  let expired = true;
  let claimToken;
  let outcome;
  let transactionOpen = false;
  let writes = 0;
  let invalidations = 0;
  const model = {
    updateManyAndReturn: async ({ where, data }) => {
      assert.equal(where.attempts.lt, 3);
      assert.equal(where.OR[1].status, 'processing');
      assert.ok(where.OR[1].leaseUntil.lte <= new Date());
      if (!expired) return [];
      expired = false;
      claimToken = data.leaseToken;
      return [{ id, status, attempts: 2, leaseToken: claimToken, input: upload, ownerId: 17, mimeType: 'image/png' }];
    },
    updateMany: async ({ where, data }) => {
      if (where.leaseToken) {
        assert.equal(where.leaseToken, claimToken);
        assert.equal(transactionOpen, true, 'public commit and final state must share a transaction');
      }
      if (data.status) status = data.status;
      if (data.outcome) outcome = data.outcome;
      return { count: 1 };
    },
    findMany: async () => outcome ? [{ id, outcome }] : [],
  };
  const prisma = {
    eventCreationJob: model,
    $transaction: async operation => {
      transactionOpen = true;
      const result = await operation({ eventCreationJob: model });
      transactionOpen = false;
      return result;
    },
  };
  const worker = load(workerCode, {
    '../app/lib/prisma': { prisma },
    '../app/api/process-image/scan': {
      ImageScanError: class extends Error {},
      scanPosterImage: async file => {
        assert.equal(file.type, 'image/jpeg', 'only the rendered cover is scanned');
        return { events: [{ title: 'Rassegna', date: '2030-10-12', time: '20:00', location: 'Schio', category: 'Music' }] };
      },
    },
    '../app/lib/google-calendar': { processCalendarDeliveries: async () => {} },
    '../app/lib/supabase': { getSupabaseClient: () => ({ storage: { from: () => ({
      upload: async (_, content) => {
        assert.equal((await sharp(content).metadata()).format, 'jpeg');
        return { error: null };
      },
      getPublicUrl: () => ({ data: { publicUrl: 'https://storage.test/cover.jpg' } }),
    }) } }) },
    './verify-poster-cover': { verifyPosterCover: async () => ({ crop: upload }) },
    './event-series-create': { createEventWithSeries: async (data, _, tx) => {
      assert.equal(tx.eventCreationJob, model);
      assert.equal(data.createdById, 17);
      assert.equal(data.rawText, '');
      assert.equal(data.originalImageUrl, undefined);
      return { event: { id: ++writes, title: data.title }, seriesSlug: 'series' };
    } },
    './event-duplicates': { findDuplicateEvent: async () => null, lockEventDates: async () => {} },
    './slug-utils': { generateUniqueSlug: () => 'event-1' },
    './event-autopilot': { getAutopilotDecision: () => ({ action: 'publish' }) },
    './poster-sections': { extractEventSections: async () => [] },
    './event-utils': { toIsoDate: value => value },
    './event-display': { getEventStartTime: value => value },
    './geocoding': { geocodeLocation: async () => ({}) },
    './public-event-cache': { invalidatePublicEvents: ({ slug }) => {
      assert.equal(slug, 'event-1');
      assert.equal(transactionOpen, false);
      invalidations++;
      return true;
    } },
  });
  assert.deepEqual(await Promise.all([worker.runEventCreationJob(id), worker.runEventCreationJob(id)]), [true, false]);
  assert.equal(status, 'published');
  assert.equal(writes, 1);
  assert.equal(invalidations, 1);
});
