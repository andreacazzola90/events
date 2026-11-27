import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as groqRateLimit from './groq-rate-limit.ts';

function loadTextAI(env, respond) {
  const calls = [];
  class OpenAI {
    constructor(settings) {
      this.settings = settings;
      calls.push({ type: 'client', settings });
      this.chat = { completions: { create: async (request, requestOptions) => {
        calls.push({ type: 'request', settings, request, requestOptions });
        return respond(settings, request, requestOptions);
      } } };
    }
  }
  const context = {
    exports: {}, process: { env }, AbortSignal, Date, Error, console: { warn() {} },
    require(name) {
      if (name === 'openai') return { default: OpenAI, __esModule: true };
      if (name.endsWith('/groq-rate-limit')) return groqRateLimit;
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  const compiled = ts.transpileModule(readFileSync(new URL('./text-ai.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(compiled, context);
  return { ...context.exports, calls };
}

const request = {
  messages: [{ role: 'user', content: 'fixture-only prompt' }],
  response_format: { type: 'json_object' },
  temperature: 0.1,
  max_tokens: 100,
  reasoning_effort: 'low',
};

const completion = (content = '{"ok":true}') => ({
  choices: [{ finish_reason: 'stop', message: { content } }],
});

test('uses Groq first with SDK retries disabled and leaves response shape unchanged', async () => {
  const fixture = loadTextAI({ GROQ_API_SECRET_KEY: 'test-key', GROQ_TEXT_MODEL: 'groq-fixture-model' }, async () => completion());
  const complete = fixture.createTextAI(undefined, { logFailures: false });
  const result = await complete(request, { budgetMs: 2_000 });

  assert.equal(result.choices[0].message.content, '{"ok":true}');
  assert.equal(fixture.calls.length, 2);
  assert.equal(fixture.calls[0].settings.maxRetries, 0);
  assert.equal(fixture.calls[1].request.model, 'groq-fixture-model');
  assert.equal(fixture.calls[1].request.reasoning_effort, 'low');
});

test('falls through Groq quota to Cloudflare Workers AI using the account endpoint', async () => {
  const fixture = loadTextAI({
    GROQ_API_SECRET_KEY: 'test-groq',
    GROQ_TEXT_MODEL: 'groq-fallback-fixture',
    CLOUDFLARE_WORKERS_AI_API_TOKEN: 'test-cloudflare',
    CLOUDFLARE_ACCOUNT_ID: 'account-id',
  }, async settings => {
    if (settings.baseURL.includes('api.groq.com')) {
      throw Object.assign(new Error('limited'), { status: 429, headers: { 'retry-after': '60' } });
    }
    return completion();
  });
  const result = await fixture.createTextAI(undefined, { logFailures: false })(request, { budgetMs: 2_000 });

  assert.equal(result.choices[0].finish_reason, 'stop');
  const requests = fixture.calls.filter(call => call.type === 'request');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].settings.baseURL, 'https://api.cloudflare.com/client/v4/accounts/account-id/ai/v1');
  assert.equal(requests[1].settings.apiKey, 'test-cloudflare');
  assert.equal(requests[1].request.model, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  assert.equal(requests[1].request.reasoning_effort, undefined);
});

test('preserves Groq retry and full budget when no text fallback is configured', async () => {
  let attempts = 0;
  const fixture = loadTextAI({
    GROQ_API_SECRET_KEY: 'test-groq',
    GROQ_TEXT_MODEL: 'groq-retry-only-fixture',
    OPENROUTER_API_SECRET_KEY: 'existing-vision-only-key',
  }, async () => {
    if (++attempts === 1) {
      throw Object.assign(new Error('limited'), { status: 429, headers: { 'retry-after': '0.001' } });
    }
    return completion();
  });
  await fixture.createTextAI(undefined, { logFailures: false })(request, { budgetMs: 12_000 });
  const requests = fixture.calls.filter(call => call.type === 'request');
  assert.equal(requests.length, 2);
  assert.ok(requests.every(call => call.settings.baseURL.includes('api.groq.com')));
  assert.ok(requests[0].requestOptions.timeout > 11_000);
});

test('falls through both quota failures to OpenRouter and skips incomplete Cloudflare configuration', async () => {
  for (const accountId of ['account-id', '']) {
    const fixture = loadTextAI({
      GROQ_API_SECRET_KEY: 'test-groq',
      GROQ_TEXT_MODEL: `groq-third-fallback-fixture-${accountId}`,
      CLOUDFLARE_WORKERS_AI_API_TOKEN: 'test-cloudflare',
      CLOUDFLARE_ACCOUNT_ID: accountId,
      OPENROUTER_API_SECRET_KEY: 'test-openrouter',
      OPENROUTER_TEXT_MODEL: 'provider/model:free',
    }, async settings => {
      if (!settings.baseURL.includes('openrouter.ai')) {
        throw Object.assign(new Error('limited'), { status: 429, headers: { 'retry-after': '60' } });
      }
      return completion();
    });
    await fixture.createTextAI(undefined, { logFailures: false })(request, { budgetMs: 2_000 });
    const requests = fixture.calls.filter(call => call.type === 'request');
    assert.equal(requests.length, accountId ? 3 : 2);
    assert.equal(requests.at(-1).request.model, 'provider/model:free');
  }
});

test('uses OpenRouter only with an explicitly configured free model', async () => {
  const fixture = loadTextAI({
    AI_TEXT_PROVIDERS: 'openrouter',
    OPENROUTER_API_SECRET_KEY: 'test-openrouter',
    OPENROUTER_TEXT_MODEL: 'provider/model:free',
  }, async () => completion());
  await fixture.createTextAI(undefined, { logFailures: false })(request, { budgetMs: 2_000 });
  assert.equal(fixture.calls[1].settings.baseURL, 'https://openrouter.ai/api/v1');
  assert.equal(fixture.calls[1].request.model, 'provider/model:free');

  const paid = loadTextAI({
    AI_TEXT_PROVIDERS: 'openrouter',
    OPENROUTER_API_SECRET_KEY: 'test-openrouter',
    OPENROUTER_TEXT_MODEL: 'provider/model',
  }, async () => completion());
  await assert.rejects(paid.createTextAI(undefined, { logFailures: false })(request), error =>
    error.kind === 'configuration' && /:free/.test(error.message));
  assert.equal(paid.calls.length, 0);
});

test('rejects malformed or truncated JSON before exposing a response and may use a safe fallback', async () => {
  const fixture = loadTextAI({
    GROQ_API_SECRET_KEY: 'test-groq',
    GROQ_TEXT_MODEL: 'groq-invalid-json-fixture',
    CLOUDFLARE_WORKERS_AI_API_TOKEN: 'test-cloudflare',
    CLOUDFLARE_ACCOUNT_ID: 'account-id',
  }, async settings => {
    if (settings.baseURL.includes('groq')) {
      return { choices: [{ finish_reason: 'stop', message: { content: '{broken' } }] };
    }
    return completion();
  });
  const result = await fixture.createTextAI(undefined, { logFailures: false })(request, { budgetMs: 2_000 });
  assert.equal(result.choices[0].message.content, '{"ok":true}');
  assert.equal(fixture.calls.filter(call => call.type === 'request').length, 2);
});

test('does not mask permanent credential or safety failures with fallback', async () => {
  for (const respond of [
    async () => { throw Object.assign(new Error('invalid request'), { status: 400 }); },
    async () => { throw Object.assign(new Error('unauthorized'), { status: 401 }); },
    async () => { throw Object.assign(new Error('request too large'), { status: 413 }); },
    async () => ({ choices: [{ finish_reason: 'content_filter', message: { content: '' } }] }),
  ]) {
    const fixture = loadTextAI({
      GROQ_API_SECRET_KEY: 'test-groq',
      GROQ_TEXT_MODEL: 'groq-permanent-fixture',
      CLOUDFLARE_WORKERS_AI_API_TOKEN: 'test-cloudflare',
      CLOUDFLARE_ACCOUNT_ID: 'account-id',
    }, respond);
    await assert.rejects(fixture.createTextAI(undefined, { logFailures: false })(request), error =>
        error.kind === 'permanent' && error.cause === undefined);
    assert.equal(fixture.calls.filter(call => call.type === 'request').length, 1);
  }
});

test('rejects explicit HTTP 200 errors even when valid-looking content accompanies them', async () => {
  for (const position of ['top-level', 'choice']) {
    const fixture = loadTextAI({
      AI_TEXT_PROVIDERS: 'openrouter,cloudflare',
      OPENROUTER_API_SECRET_KEY: 'test-openrouter',
      OPENROUTER_TEXT_MODEL: 'provider/model:free',
      CLOUDFLARE_WORKERS_AI_API_TOKEN: 'test-cloudflare',
      CLOUDFLARE_ACCOUNT_ID: 'account-id',
    }, async () => {
      const response = completion();
      const target = position === 'top-level' ? response : response.choices[0];
      target.error = { code: 403, message: 'Safety rejection' };
      return response;
    });
    await assert.rejects(fixture.createTextAI(undefined, { logFailures: false })(request),
      error => error.kind === 'permanent' && error.status === 403);
    assert.equal(fixture.calls.filter(call => call.type === 'request').length, 1);
  }
});

test('only all-provider quota exhaustion produces the cron-compatible rate-limit error', async () => {
  const allLimited = loadTextAI({
    GROQ_API_SECRET_KEY: 'test-groq',
    GROQ_TEXT_MODEL: 'groq-all-limited-fixture',
    CLOUDFLARE_WORKERS_AI_API_TOKEN: 'test-cloudflare',
    CLOUDFLARE_ACCOUNT_ID: 'account-id',
  }, async settings => {
    throw Object.assign(new Error('limited'), {
      status: 429,
      headers: { 'retry-after': settings.baseURL.includes('groq') ? '1' : '10' },
    });
  });
  await assert.rejects(allLimited.createTextAI(undefined, { logFailures: false })(request, { budgetMs: 2_000 }),
    error => error instanceof groqRateLimit.GroqRateLimitError &&
      error.retryAt > Date.now() + 9_000 && error.cause === undefined);

  const mixed = loadTextAI({
    GROQ_API_SECRET_KEY: 'test-groq',
    GROQ_TEXT_MODEL: 'groq-mixed-failure-fixture',
    CLOUDFLARE_WORKERS_AI_API_TOKEN: 'test-cloudflare',
    CLOUDFLARE_ACCOUNT_ID: 'account-id',
  }, async settings => {
    if (settings.baseURL.includes('groq')) {
      throw Object.assign(new Error('limited'), { status: 429, headers: { 'retry-after': '60' } });
    }
    throw Object.assign(new Error('temporary provider failure'), { status: 503 });
  });
  await assert.rejects(mixed.createTextAI(undefined, { logFailures: false })(request, { budgetMs: 2_000 }),
    error => error.kind === 'unavailable' && !(error instanceof groqRateLimit.GroqRateLimitError));
});

test('shares the overall budget to preserve a timeout window for each configured provider', async () => {
  const fixture = loadTextAI({
    GROQ_API_SECRET_KEY: 'test-groq',
    GROQ_TEXT_MODEL: 'groq-budget-fixture',
    CLOUDFLARE_WORKERS_AI_API_TOKEN: 'test-cloudflare',
    CLOUDFLARE_ACCOUNT_ID: 'account-id',
  }, async settings => {
    if (settings.baseURL.includes('groq')) throw Object.assign(new Error('temporary'), { status: 503 });
    return completion();
  });
  await fixture.createTextAI(undefined, { logFailures: false })(request, { budgetMs: 2_000 });
  const clients = fixture.calls.filter(call => call.type === 'client');
  assert.equal(clients.length, 2);
  assert.ok(clients[0].settings.timeout <= 1_000);
  assert.ok(clients[1].settings.timeout <= 2_000);
  assert.ok(clients[0].settings.timeout < clients[1].settings.timeout);
});

test('propagates caller cancellation without invoking a provider', async () => {
  const fixture = loadTextAI({ GROQ_API_SECRET_KEY: 'test-key' }, async () => completion());
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fixture.createTextAI(undefined, { logFailures: false })(request, { signal: controller.signal }),
    { name: 'AbortError' });
  assert.equal(fixture.calls.length, 0);
});

test('propagates cancellation during a provider request without using fallback', async () => {
  const controller = new AbortController();
  const fixture = loadTextAI({
    GROQ_API_SECRET_KEY: 'test-groq',
    GROQ_TEXT_MODEL: 'groq-abort-fixture',
    CLOUDFLARE_WORKERS_AI_API_TOKEN: 'test-cloudflare',
    CLOUDFLARE_ACCOUNT_ID: 'account-id',
  }, async () => {
    controller.abort();
    throw controller.signal.reason;
  });
  await assert.rejects(fixture.createTextAI(undefined, { logFailures: false })(request, { signal: controller.signal }),
    { name: 'AbortError' });
  assert.equal(fixture.calls.filter(call => call.type === 'request').length, 1);
});
