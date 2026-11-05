import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./request-body-limit.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = { exports: {}, ArrayBuffer, Headers, Request, Uint8Array };
runInNewContext(compiled, context);
const { readBoundedRequestBody, requestWithBoundedBody, RequestBodyTooLargeError } = context.exports;

test('reads request bodies within the byte limit even without content-length', async () => {
  const request = new Request('https://events.example/api', {
    method: 'POST',
    body: new Uint8Array([1, 2, 3]),
  });
  assert.deepEqual([...await readBoundedRequestBody(request, 3)], [1, 2, 3]);
});

test('cancels a streaming request as soon as the byte limit is crossed', async () => {
  let canceled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(4));
      controller.enqueue(new Uint8Array([5]));
    },
    cancel() {
      canceled = true;
    },
  });
  const request = new Request('https://events.example/api', { method: 'POST', body, duplex: 'half' });
  await assert.rejects(readBoundedRequestBody(request, 4), RequestBodyTooLargeError);
  assert.equal(canceled, true);
});

test('rejects compressed request bodies instead of stripping their encoding header', async () => {
  const request = new Request('https://events.example/api', {
    method: 'POST',
    headers: { 'content-encoding': 'gzip' },
    body: new Uint8Array([1, 2, 3]),
  });
  await assert.rejects(readBoundedRequestBody(request, 10), /Compressed request bodies/);
});

test('rebuilds the request with its headers and signal and an exact-size body', async () => {
  const controller = new AbortController();
  const request = new Request('https://events.example/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': '3' },
    signal: controller.signal,
    body: new Uint8Array([1, 2, 3]),
  });
  const bounded = requestWithBoundedBody(request, new Uint8Array([4, 5]));
  assert.equal(bounded.headers.get('content-type'), 'application/json');
  assert.equal(bounded.headers.has('content-length'), false);
  assert.equal(bounded.signal.aborted, false);
  assert.deepEqual([...new Uint8Array(await bounded.arrayBuffer())], [4, 5]);
  controller.abort();
  assert.equal(bounded.signal.aborted, true);
});
