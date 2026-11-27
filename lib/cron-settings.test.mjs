import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 };

function compile(source) {
  return ts.transpileModule(source, { compilerOptions }).outputText;
}

function settingsHelper({ initial = [], failCreate = false } = {}) {
  let rows = new Map(initial.map(({ jobKey, enabled }) => [jobKey, enabled]));
  const prisma = {
    cronJobSetting: {
      findMany: async () => Array.from(rows, ([jobKey, enabled]) => ({ jobKey, enabled })),
    },
    $transaction: async (callback) => {
      const next = new Map(rows);
      const transaction = {
        cronJobSetting: {
          upsert: async ({ where, create, update }) => {
            if (failCreate && where.jobKey === 'instagram-story') throw new Error('write failed');
            const enabled = next.has(where.jobKey) ? update.enabled : create.enabled;
            next.set(where.jobKey, enabled);
            return { jobKey: where.jobKey, enabled };
          },
        },
      };
      const result = await callback(transaction);
      rows = next;
      return result;
    },
  };
  const context = {
    exports: {},
    require(name) {
      if (name === '@/lib/prisma') return { prisma };
      if (name.endsWith('/cron-jobs')) {
        const helper = { exports: {}, require: () => { throw new Error('Unexpected dependency'); } };
        vm.runInNewContext(compile(readFileSync(new URL('../lib/cron-jobs.ts', import.meta.url), 'utf8')), helper);
        return helper.exports;
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(compile(readFileSync(new URL('../lib/cron-job-settings.ts', import.meta.url), 'utf8')), context);
  return { ...context.exports, rows: () => new Map(rows) };
}

function apiFixture({ authStatus = 200, failRead = false, failSave = false } = {}) {
  const calls = { reads: 0, saves: 0 };
  const settings = Array.from({ length: 7 }, (_, index) => ({
    key: ['visitpedemontana', 'google-calendar', 'instagram-story', 'instagram-scan',
      'crop-learning-cleanup', 'personal-telegram-cleanup', 'event-creation'][index],
    enabled: true,
  }));
  function loadCronJobs() {
    const context = { exports: {} };
    vm.runInNewContext(compile(readFileSync(new URL('../lib/cron-jobs.ts', import.meta.url), 'utf8')), context);
    return context.exports;
  }
  const routeSource = readFileSync(new URL('../app/api/admin/cron-settings/route.ts', import.meta.url), 'utf8');
  const context = {
    exports: {},
    console: { error() {} },
    require(name) {
      if (name === 'next/server') {
        return { NextResponse: { json: (data, options) => ({ data, status: options?.status ?? 200 }) } };
      }
      if (name === '@/lib/auth-helpers') {
        return { withAdminAuth: async (callback) => authStatus === 200 ? callback() : { status: authStatus } };
      }
      if (name.endsWith('/cron-job-settings')) {
        return {
          getCronJobSettings: async () => {
            calls.reads += 1;
            if (failRead) throw new Error('database unavailable');
            return settings;
          },
          saveCronJobSettings: async (keys) => {
            calls.saves += 1;
            if (failSave) throw new Error('database unavailable');
            return settings.map((job) => ({ ...job, enabled: keys.includes(job.key) }));
          },
        };
      }
      if (name.endsWith('/cron-jobs')) return loadCronJobs();
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(compile(routeSource), context);
  return {
    calls,
    get: () => context.exports.GET(),
    put: (body, { origin = 'https://events.test', invalidJson = false } = {}) => context.exports.PUT({
      headers: { get: (name) => name === 'origin' ? origin : null },
      nextUrl: new URL('https://events.test/api/admin/cron-settings'),
      json: async () => {
        if (invalidJson) throw new SyntaxError('invalid JSON');
        return body;
      },
    }),
  };
}

test('missing settings default to enabled and replacement saves are atomic', async () => {
  const empty = settingsHelper();
  assert.ok((await empty.getCronJobSettings()).every(({ enabled }) => enabled));

  const helper = settingsHelper({ initial: [{ jobKey: 'google-calendar', enabled: false }] });
  const initial = await helper.getCronJobSettings();
  assert.equal(initial.length, 7);
  assert.equal(initial.find(({ key }) => key === 'google-calendar').enabled, false);
  assert.ok(initial.filter(({ key }) => key !== 'google-calendar').every(({ enabled }) => enabled));

  const saved = await helper.saveCronJobSettings([]);
  assert.ok(saved.every(({ enabled }) => !enabled));
  assert.equal(helper.rows().size, 7);

  const failing = settingsHelper({
    initial: [{ jobKey: 'google-calendar', enabled: false }],
    failCreate: true,
  });
  await assert.rejects(failing.saveCronJobSettings(['instagram-story']), /write failed/);
  assert.deepEqual([...failing.rows()], [['google-calendar', false]]);
});

test('settings API protects reads and writes with admin auth and same-origin validation', async () => {
  for (const authStatus of [401, 403]) {
    const api = apiFixture({ authStatus });
    assert.equal((await api.get()).status, authStatus);
    assert.equal((await api.put({ jobs: [] })).status, authStatus);
    assert.deepEqual(api.calls, { reads: 0, saves: 0 });
  }
  const crossOrigin = apiFixture();
  assert.equal((await crossOrigin.put({ jobs: [] }, { origin: 'https://other.test' })).status, 403);
  assert.equal(crossOrigin.calls.saves, 0);

  const authorized = apiFixture();
  const response = await authorized.get();
  assert.equal(response.status, 200);
  assert.equal(response.data.jobs.length, 7);
  assert.equal(authorized.calls.reads, 1);
});

test('saving known jobs preserves settings from another application version', async () => {
  const helper = settingsHelper({ initial: [{ jobKey: 'future-job', enabled: false }] });
  await helper.saveCronJobSettings(['instagram-story']);
  assert.equal(helper.rows().get('future-job'), false);
  assert.equal(helper.rows().get('instagram-story'), true);
  assert.equal(helper.rows().get('google-calendar'), false);
});

test('settings API rejects malformed and unknown selections, while allowing all jobs disabled', async () => {
  const api = apiFixture();
  for (const body of [null, {}, { jobs: 'instagram-story' }, { jobs: ['unknown'] },
    { jobs: ['instagram-story', 'instagram-story'] }, { jobs: [], extra: true }]) {
    assert.equal((await api.put(body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await api.put({}, { invalidJson: true })).status, 400);
  assert.equal(api.calls.saves, 0);

  const response = await api.put({ jobs: [] });
  assert.equal(response.status, 200);
  assert.ok(response.data.jobs.every(({ enabled }) => !enabled));
  assert.equal(api.calls.saves, 1);
});

test('settings API reports database failures without claiming success', async () => {
  const readFailure = apiFixture({ failRead: true });
  assert.equal((await readFailure.get()).status, 503);
  assert.equal(readFailure.calls.reads, 1);

  const saveFailure = apiFixture({ failSave: true });
  assert.equal((await saveFailure.put({ jobs: ['event-creation'] })).status, 503);
  assert.equal(saveFailure.calls.saves, 1);
});
