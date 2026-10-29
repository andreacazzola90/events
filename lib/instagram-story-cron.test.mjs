import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const routePath = '../app/api/cron/generate-instagram-story/route.ts';

function loadStoryRoute(env) {
  const source = readFileSync(new URL(routePath, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = {
    exports: {},
    Buffer,
    process: { env },
    require(name) {
      if (name === 'next/server') {
        return { NextResponse: { json: (data, options) => ({ data, status: options?.status ?? 200 }) } };
      }
      if (name === 'sharp') {
        return {
          __esModule: true,
          default: () => ({ jpeg: () => ({ toBuffer: async () => Buffer.from('story') }) }),
        };
      }
      if (name === '@/lib/prisma') return { prisma: { event: { findMany: async () => [] } } };
      if (name === '@/lib/supabase') {
        return {
          getSupabaseClient: () => ({
            storage: {
              from: () => ({
                upload: async () => ({ error: null }),
                getPublicUrl: path => ({ data: { publicUrl: `https://storage.test/${path}` } }),
              }),
            },
          }),
        };
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(compiled, context);
  return context.exports;
}

function requestWithAuthorization(authorization) {
  return { headers: { get: () => authorization } };
}

test('the weekly Instagram story endpoint is scheduled every Wednesday evening', () => {
  const storyCron = config.crons.find(
    ({ path }) => path === '/api/cron/generate-instagram-story',
  );

  assert.ok(storyCron, 'weekly story endpoint must be scheduled');
  assert.equal(storyCron.schedule, '0 18 * * 3');
});

test('the story endpoint accepts Vercel CRON_SECRET and fails closed without a secret', async () => {
  const missingSecret = await loadStoryRoute({}).GET(requestWithAuthorization(null));
  assert.equal(missingSecret.status, 503);

  const unauthorized = await loadStoryRoute({ CRON_SECRET: 'vercel-secret' })
    .GET(requestWithAuthorization('Bearer wrong-secret'));
  assert.equal(unauthorized.status, 401);

  const generated = await loadStoryRoute({ CRON_SECRET: 'vercel-secret' })
    .GET(requestWithAuthorization('Bearer vercel-secret'));
  assert.equal(generated.status, 200);
  assert.equal(generated.data.status, 'success');

  const legacyGenerated = await loadStoryRoute({ CRON_SECRET_KEY: 'legacy-secret' })
    .GET(requestWithAuthorization('Bearer legacy-secret'));
  assert.equal(legacyGenerated.status, 200);
});
