export const SOURCE_LEASE_MS = 6 * 60_000;
export const LEGACY_RUN_GRACE_MS = 6 * 60_000;

export type SourceRunSnapshot = {
  jobKey: string;
  status: string;
  startedAt: Date;
  finishedAt?: Date | null;
  resultJson: string | null;
  queuePositionAt: Date | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  stateVersion: number;
};

function parseResult(resultJson: string | null): Record<string, unknown> | null {
  if (!resultJson) return null;
  try {
    const parsed: unknown = JSON.parse(resultJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function mergeSourceResult(
  existingResultJson: string | null,
  nextResult: Record<string, unknown>,
): string {
  const existing = parseResult(existingResultJson);
  const merged: Record<string, unknown> = existing ? { ...existing } : {};
  for (const [key, value] of Object.entries(nextResult)) {
    if (value !== undefined) merged[key] = value;
  }
  return JSON.stringify(merged);
}

export function isSourceIncomplete(run: Pick<SourceRunSnapshot, 'queuePositionAt' | 'resultJson'>): boolean {
  if (run.queuePositionAt) return true;
  const result = parseResult(run.resultJson);
  if (!result) return false;
  return ['partial', 'partial-error', 'error', 'skipped'].includes(String(result.status))
    || result.collectionIncomplete === true
    || Number(result.deferred) > 0
    || (Array.isArray(result.pendingEventLinks) && result.pendingEventLinks.length > 0)
    || Number(result.nextApiPage) > 0
    || (typeof result.rateLimitRetryAt === 'number' && result.rateLimitRetryAt > 0);
}

export function isRateLimitCoolingDown(
  resultJson: string | null,
  now: Date,
): boolean {
  const retryAt = parseResult(resultJson)?.rateLimitRetryAt;
  return typeof retryAt === 'number' && retryAt > now.getTime();
}

export function sourceQueueTail(
  runs: Iterable<Pick<SourceRunSnapshot, 'queuePositionAt' | 'startedAt' | 'resultJson'>>,
  now: Date,
): Date {
  let latest = now.getTime() - 1;
  for (const run of runs) {
    if (!isSourceIncomplete(run)) continue;
    latest = Math.max(latest, run.queuePositionAt?.getTime() ?? run.startedAt.getTime());
  }
  return new Date(Math.max(now.getTime(), latest + 1));
}

export function orderSourceRuns<T extends { id: number | null }>(
  sources: T[],
  runsByKey: Map<string, SourceRunSnapshot>,
): Array<{ source: T; run: SourceRunSnapshot }> {
  return sources
    .map(source => {
      const jobKey = `scrape-source:${source.id ?? 'default'}`;
      const run = runsByKey.get(jobKey);
      if (!run) throw new Error(`Missing persisted source run: ${jobKey}`);
      return { source, run };
    })
    .sort((first, second) => {
      const firstIncomplete = isSourceIncomplete(first.run);
      const secondIncomplete = isSourceIncomplete(second.run);
      if (firstIncomplete !== secondIncomplete) return firstIncomplete ? -1 : 1;
      const firstAt = first.run.queuePositionAt?.getTime() ?? first.run.startedAt.getTime();
      const secondAt = second.run.queuePositionAt?.getTime() ?? second.run.startedAt.getTime();
      return firstAt - secondAt || first.run.jobKey.localeCompare(second.run.jobKey);
    });
}

function availableLeaseWhere(now: Date): Record<string, unknown> {
  return {
    OR: [
      { leaseExpiresAt: { lte: now } },
      { leaseExpiresAt: null, status: { not: 'running' } },
      {
        leaseExpiresAt: null,
        status: 'running',
        startedAt: { lte: new Date(now.getTime() - LEGACY_RUN_GRACE_MS) },
      },
    ],
  };
}

export async function claimSourceRun(
  model: any,
  run: SourceRunSnapshot,
  owner: string,
  now: Date,
): Promise<number | null> {
  const result = await model.updateMany({
    where: {
      jobKey: run.jobKey,
      stateVersion: run.stateVersion,
      ...availableLeaseWhere(now),
    },
    data: {
      status: 'running',
      startedAt: now,
      finishedAt: null,
      leaseOwner: owner,
      leaseExpiresAt: new Date(now.getTime() + SOURCE_LEASE_MS),
      stateVersion: { increment: 1 },
    },
  });
  return result.count === 1 ? run.stateVersion + 1 : null;
}

export async function deferSourceRun(
  model: any,
  run: SourceRunSnapshot,
  result: Record<string, unknown>,
  runs: Iterable<SourceRunSnapshot>,
  now: Date,
): Promise<Date | null> {
  const queuePositionAt = sourceQueueTail(runs, now);
  const update = await model.updateMany({
    where: {
      jobKey: run.jobKey,
      stateVersion: run.stateVersion,
      ...availableLeaseWhere(now),
    },
    data: {
      status: 'skipped',
      finishedAt: now,
      resultJson: mergeSourceResult(run.resultJson, result),
      queuePositionAt,
      leaseOwner: null,
      leaseExpiresAt: null,
      stateVersion: { increment: 1 },
    },
  });
  return update.count === 1 ? queuePositionAt : null;
}

export async function rotateSourceRun(
  model: any,
  run: SourceRunSnapshot,
  runs: Iterable<SourceRunSnapshot>,
  now: Date,
): Promise<Date | null> {
  const queuePositionAt = sourceQueueTail(runs, now);
  const update = await model.updateMany({
    where: {
      jobKey: run.jobKey,
      stateVersion: run.stateVersion,
      ...availableLeaseWhere(now),
    },
    data: { queuePositionAt, stateVersion: { increment: 1 } },
  });
  return update.count === 1 ? queuePositionAt : null;
}

export async function finishSourceRun(
  model: any,
  run: SourceRunSnapshot,
  owner: string,
  claimedVersion: number,
  result: Record<string, unknown>,
  now: Date,
): Promise<{ count: number; queuePositionAt: Date | null }> {
  const incomplete = isSourceIncomplete({ queuePositionAt: null, resultJson: JSON.stringify(result) });
  const queuePositionAt = incomplete ? run.queuePositionAt ?? now : null;
  const update = await model.updateMany({
    where: {
      jobKey: run.jobKey,
      stateVersion: claimedVersion,
      leaseOwner: owner,
      leaseExpiresAt: { gt: now },
    },
    data: {
      status: ['error', 'partial-error'].includes(String(result.status)) ? 'failed' : 'completed',
      finishedAt: now,
      resultJson: mergeSourceResult(run.resultJson, result),
      queuePositionAt,
      leaseOwner: null,
      leaseExpiresAt: null,
      stateVersion: { increment: 1 },
    },
  });
  return { count: update.count, queuePositionAt: update.count === 1 ? queuePositionAt : null };
}
