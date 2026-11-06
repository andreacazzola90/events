import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const routePath = '../app/api/admin/cron-status/route.ts';

function routeWithRuns(runs) {
  const queries = [];
  const source = readFileSync(new URL(routePath, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = {
    exports: {},
    require(name) {
      if (name === 'next/server') {
        return { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
      }
      if (name === '@/lib/prisma') {
        return { prisma: { cronJobRun: { findMany: async (query) => {
          queries.push(query);
          return runs;
        } } } };
      }
      if (name === '@/lib/auth-helpers') {
        return { withAdminAuth: (callback) => callback() };
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(compiled, context);
  return { GET: context.exports.GET, queries };
}

test('source status query returns all site runs and the aggregate run without the generic limit', async () => {
  const runs = Array.from({ length: 205 }, (_, index) => ({
    jobKey: `scrape-source:${index + 1}`,
    status: 'completed',
    startedAt: new Date('2026-11-06T09:00:00Z'),
    finishedAt: new Date('2026-11-06T09:01:00Z'),
    resultJson: JSON.stringify({ links: [] }),
  }));
  runs.push({ jobKey: 'visitpedemontana', status: 'running', startedAt: new Date(), resultJson: null });
  runs.push({ jobKey: 'daily-dispatch', status: 'completed', startedAt: new Date(), resultJson: null });
  const route = routeWithRuns(runs);

  const response = await route.GET({
    nextUrl: { searchParams: new URLSearchParams('includeSourceRuns=1') },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.runs.length, 207);
  assert.equal(JSON.stringify(route.queries[0].where.OR), JSON.stringify([
    { jobKey: { startsWith: 'scrape-source:' } },
    { jobKey: 'visitpedemontana' },
    { jobKey: 'daily-dispatch' },
  ]));
  assert.equal('take' in route.queries[0], false);
});

test('ordinary status queries retain their bounded limit', async () => {
  const route = routeWithRuns([]);

  await route.GET({ nextUrl: { searchParams: new URLSearchParams('limit=17') } });

  assert.equal(route.queries[0].take, 17);
  assert.equal(route.queries[0].where, undefined);
});
