import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SOURCE_LEASE_MS,
  claimSourceRun,
  deferSourceRun,
  finishSourceRun,
  isRateLimitCoolingDown,
  orderSourceRuns,
  rotateSourceRun,
} from './cron-source-scheduler.ts';

const now = new Date('2026-11-17T17:00:00Z');

function sourceRun(id, overrides = {}) {
  return {
    jobKey: `scrape-source:${id}`,
    status: 'completed',
    startedAt: new Date(now.getTime() - id * 60_000),
    finishedAt: new Date(now.getTime() - id * 30_000),
    resultJson: null,
    queuePositionAt: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    stateVersion: 0,
    ...overrides,
  };
}

function modelFor(rows) {
  return {
    async updateMany({ where, data }) {
      const row = rows.get(where.jobKey);
      if (!row || row.stateVersion !== where.stateVersion) return { count: 0 };
      if (where.leaseOwner && row.leaseOwner !== where.leaseOwner) return { count: 0 };
      if (where.leaseExpiresAt?.gt && !(row.leaseExpiresAt > where.leaseExpiresAt.gt)) return { count: 0 };
      if (where.OR) {
        const leaseAvailable = where.OR.some(condition => {
          if (condition.leaseExpiresAt?.lte) return row.leaseExpiresAt && row.leaseExpiresAt <= condition.leaseExpiresAt.lte;
          if (condition.leaseExpiresAt === null && condition.status?.not) {
            return row.leaseExpiresAt === null && row.status !== condition.status.not;
          }
          if (condition.leaseExpiresAt === null && condition.status === 'running') {
            return row.leaseExpiresAt === null && row.status === 'running'
              && row.startedAt <= condition.startedAt.lte;
          }
          return false;
        });
        if (!leaseAvailable) return { count: 0 };
      }
      if (data.stateVersion?.increment) data.stateVersion = row.stateVersion + data.stateVersion.increment;
      Object.assign(row, data);
      return { count: 1 };
    },
  };
}

test('claims and budget deferrals reject stale loaded versions', async () => {
  const run = sourceRun(1);
  const rows = new Map([[run.jobKey, { ...run, stateVersion: 2 }]]);
  const model = modelFor(rows);

  assert.equal(await claimSourceRun(model, run, 'worker-a', now), null);
  assert.equal(await deferSourceRun(model, run, { status: 'skipped' }, rows.values(), now), null);
  assert.equal(rows.get(run.jobKey).stateVersion, 2);
  assert.equal(rows.get(run.jobKey).resultJson, null);
});

test('only one concurrent claim wins for the same source version', async () => {
  const run = sourceRun(1);
  const rows = new Map([[run.jobKey, { ...run }]]);
  const model = modelFor(rows);

  const claims = await Promise.all([
    claimSourceRun(model, run, 'worker-a', now),
    claimSourceRun(model, run, 'worker-b', now),
  ]);

  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(claims.filter(claim => claim === null).length, 1);
  assert.equal(rows.get(run.jobKey).stateVersion, 1);
  assert.ok(['worker-a', 'worker-b'].includes(rows.get(run.jobKey).leaseOwner));
});

test('claims preserve the whole existing result and deferrals merge metadata and checkpoints', async () => {
  const checkpoint = {
    status: 'partial',
    nextApiPage: 4,
    pendingEventLinks: ['https://example.test/event'],
    rateLimitRetryAt: null,
    customDiagnostic: { marker: 'keep-me' },
  };
  const run = sourceRun(1, { resultJson: JSON.stringify(checkpoint), queuePositionAt: new Date(now.getTime() - 1_000) });
  const rows = new Map([[run.jobKey, { ...run }]]);
  const model = modelFor(rows);
  const claimedVersion = await claimSourceRun(model, run, 'worker-a', now);
  assert.equal(claimedVersion, 1);
  assert.deepEqual(JSON.parse(rows.get(run.jobKey).resultJson), checkpoint);
  assert.equal(rows.get(run.jobKey).leaseExpiresAt.getTime(), now.getTime() + SOURCE_LEASE_MS);

  const deferredRun = sourceRun(2, { resultJson: JSON.stringify(checkpoint), queuePositionAt: run.queuePositionAt });
  const deferredRows = new Map([[deferredRun.jobKey, { ...deferredRun }]]);
  const queueAt = await deferSourceRun(modelFor(deferredRows), deferredRun, {
    status: 'skipped', message: 'budget exhausted', nextApiPage: 4,
  }, deferredRows.values(), now);
  assert.ok(queueAt);
  const stored = JSON.parse(deferredRows.get(deferredRun.jobKey).resultJson);
  assert.equal(stored.customDiagnostic.marker, 'keep-me');
  assert.equal(stored.nextApiPage, 4);
  assert.deepEqual(stored.pendingEventLinks, checkpoint.pendingEventLinks);
});

test('legacy running rows stay protected until the full grace window expires', async () => {
  const activeLegacy = sourceRun(1, {
    status: 'running',
    startedAt: new Date(now.getTime() - 5 * 60_000),
  });
  const rows = new Map([[activeLegacy.jobKey, { ...activeLegacy }]]);
  const model = modelFor(rows);

  assert.equal(await claimSourceRun(model, activeLegacy, 'new-worker', now), null);
  const expiredSnapshot = { ...activeLegacy, startedAt: new Date(now.getTime() - 7 * 60_000) };
  rows.get(activeLegacy.jobKey).startedAt = expiredSnapshot.startedAt;
  assert.equal(await claimSourceRun(model, expiredSnapshot, 'new-worker', now), 1);
});

test('future cooldown is recognized without claiming the source', async () => {
  const retryAt = now.getTime() + 60_000;
  const run = sourceRun(1, {
    resultJson: JSON.stringify({ status: 'partial', rateLimitRetryAt: retryAt }),
  });
  const rows = new Map([[run.jobKey, { ...run }]]);
  assert.equal(isRateLimitCoolingDown(run.resultJson, now), true);
  let writeCount = 0;
  const model = { updateMany: async () => { writeCount += 1; return { count: 1 }; } };
  if (!isRateLimitCoolingDown(run.resultJson, now)) {
    await claimSourceRun(model, run, 'worker', now);
  }
  assert.equal(writeCount, 0);
  assert.equal(rows.get(run.jobKey).status, 'completed');
});

test('incomplete sources rotate to the tail across repeated one-source budgets', async () => {
  const rows = new Map([
    ['scrape-source:1', sourceRun(1, { queuePositionAt: new Date(now.getTime() - 3_000), resultJson: '{"status":"partial"}' })],
    ['scrape-source:2', sourceRun(2, { queuePositionAt: new Date(now.getTime() - 2_000), resultJson: '{"status":"partial"}' })],
    ['scrape-source:3', sourceRun(3, { queuePositionAt: new Date(now.getTime() - 1_000), resultJson: '{"status":"partial"}' })],
  ]);
  const model = modelFor(rows);
  const order = [];

  for (let day = 0; day < 6; day += 1) {
    const snapshot = [...rows.values()].map(run => ({ ...run }));
    const ordered = orderSourceRuns(
      [...rows.keys()].map((jobKey, index) => ({ id: index + 1 })),
      new Map(snapshot.map(item => [item.jobKey, item])),
    );
    const { run } = ordered[0];
    order.push(run.jobKey);
    const owner = `worker-${day}`;
    const startedAt = new Date(now.getTime() + day * 86_400_000);
    const claimedVersion = await claimSourceRun(model, run, owner, startedAt);
    assert.ok(claimedVersion);
    const claimed = { ...run, stateVersion: claimedVersion };
    const finishAt = new Date(startedAt.getTime() + 1_000);
    const result = await finishSourceRun(
      model, claimed, owner, claimedVersion, { status: 'partial', deferred: 1 },
      finishAt,
    );
    assert.equal(result.count, 1);
    for (const deferred of ordered.slice(1)) {
      const current = rows.get(deferred.run.jobKey);
      await deferSourceRun(model, current, { status: 'skipped', message: 'budget exhausted' }, rows.values(), finishAt);
    }
    const current = rows.get(run.jobKey);
    const rotatedAt = await rotateSourceRun(model, current, rows.values(), finishAt);
    assert.ok(rotatedAt);
  }

  assert.deepEqual(order.slice(0, 3).sort(), ['scrape-source:1', 'scrape-source:2', 'scrape-source:3']);
  assert.equal(order[0], order[3], 'the first source returns only after each budget-deferred source had a turn');
  assert.notEqual(order[0], order[1]);
  assert.notEqual(order[1], order[2]);
});

test('cooldown rotation does not acquire a lease or rewrite partial metadata', async () => {
  const run = sourceRun(1, {
    resultJson: JSON.stringify({ status: 'partial', rateLimitRetryAt: now.getTime() + 10_000, pendingEventLinks: ['keep'] }),
    queuePositionAt: new Date(now.getTime() - 1_000),
  });
  const rows = new Map([[run.jobKey, { ...run }]]);
  const position = await rotateSourceRun(modelFor(rows), run, rows.values(), now);

  assert.ok(position);
  assert.equal(rows.get(run.jobKey).status, 'completed');
  assert.equal(rows.get(run.jobKey).leaseOwner, null);
  assert.deepEqual(JSON.parse(rows.get(run.jobKey).resultJson).pendingEventLinks, ['keep']);
});
