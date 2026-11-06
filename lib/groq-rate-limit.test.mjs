import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadLimiter({ onWait } = {}) {
  let now = Date.parse('2026-11-06T12:00:00Z');
  const waits = [];
  const warnings = [];
  const context = {
    exports: {}, AbortSignal, Error,
    Date: class extends Date { static now() { return now; } },
    setTimeout(callback, ms) {
      waits.push(ms);
      now += ms;
      if (onWait) queueMicrotask(onWait);
      queueMicrotask(callback);
      return 1;
    },
    clearTimeout() {},
    console: { warn: (...args) => warnings.push(args) },
  };
  vm.runInNewContext(ts.transpileModule(
    readFileSync(new URL('./groq-rate-limit.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText, context);
  return { ...context.exports, waits, warnings, now: () => now };
}

const limited = (headers = {}, message = 'Please try again in 1.155s.') =>
  Object.assign(new Error(`429 ${message}`), { status: 429, headers });

test('recovers the extraction JSON after consecutive TPM rejections without SDK retries', async () => {
  const { withGroqRateLimit, waits, warnings } = loadLimiter();
  let calls = 0;
  const result = await withGroqRateLimit('openai/gpt-oss-20b', async options => {
    assert.equal(options.maxRetries, 0);
    assert.ok(options.timeout <= 10_000);
    assert.equal(options.signal.aborted, false);
    if (++calls < 3) throw limited();
    return { title: 'Evento' };
  }, { budgetMs: 10_000 });
  assert.equal(result.title, 'Evento');
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1305, 1305]);
  assert.equal(warnings.length, 2);
});

test('honors the longest provider hint including HTTP dates and milliseconds', () => {
  const { getGroqRetryAt, now } = loadLimiter();
  const start = now();
  assert.equal(getGroqRetryAt(limited({ 'retry-after': '2' }), start), start + 2150);
  assert.equal(getGroqRetryAt(limited({ 'retry-after': new Date(start + 5000).toUTCString() }), start), start + 5150);
  assert.equal(getGroqRetryAt(limited({ 'retry-after-ms': '3000' }), start), start + 3150);
  assert.equal(getGroqRetryAt(limited({}, 'Please try again in 1m2.5s.'), start), start + 62650);
  assert.equal(getGroqRetryAt(limited({ get: name => name === 'retry-after' ? '4' : null }), start), start + 4150);
});

test('does not wait beyond the total budget and shares cooldown across callers', async () => {
  const { withGroqRateLimit, GroqRateLimitError, waits, now } = loadLimiter();
  const start = now();
  await assert.rejects(withGroqRateLimit('same-model', async () => {
    throw limited({ 'retry-after': '60' });
  }, { budgetMs: 5000 }), error => {
    assert.ok(error instanceof GroqRateLimitError);
    assert.equal(error.retryAt, start + 60150);
    return true;
  });
  let calls = 0;
  await assert.rejects(withGroqRateLimit('same-model', async () => ++calls, { budgetMs: 5000 }),
    GroqRateLimitError);
  assert.equal(calls, 0);
  assert.deepEqual(waits, []);
});

test('bounds retries even if the provider repeatedly returns a short or missing hint', async () => {
  const { withGroqRateLimit, GroqRateLimitError, waits } = loadLimiter();
  let calls = 0;
  await assert.rejects(withGroqRateLimit('model', async () => {
    calls++;
    throw limited({}, 'Rate limit reached');
  }, { budgetMs: 120_000 }), GroqRateLimitError);
  assert.equal(calls, 5);
  assert.equal(waits.length, 4);
  assert.ok(waits.every(ms => ms >= 1000));
});

test('does not retry unrelated errors or successful calls', async () => {
  const { withGroqRateLimit, waits } = loadLimiter();
  const failure = Object.assign(new Error('Invalid credentials'), { status: 401 });
  await assert.rejects(withGroqRateLimit('model', async () => { throw failure; }),
    error => error === failure);
  assert.equal(await withGroqRateLimit('model', async () => 'ok'), 'ok');
  assert.deepEqual(waits, []);
});

test('abort during cooldown prevents the next provider call', async () => {
  const controller = new AbortController();
  const { withGroqRateLimit, waits } = loadLimiter({ onWait: () => controller.abort() });
  let calls = 0;
  await assert.rejects(withGroqRateLimit('model', async () => {
    calls++;
    throw limited();
  }, { budgetMs: 10_000, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 1);
  assert.deepEqual(waits, [1305]);
});

test('an already-aborted request never calls the provider', async () => {
  const { withGroqRateLimit } = loadLimiter();
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(withGroqRateLimit('model', async () => ++calls, { signal: controller.signal }),
    { name: 'AbortError' });
  assert.equal(calls, 0);
});
