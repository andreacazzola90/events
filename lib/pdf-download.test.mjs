import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./pdf-download.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadDownloader(fetch) {
  const context = {
    exports: {},
    AbortSignal,
    URL,
    Uint8Array,
    Error,
    fetch,
    require: name => {
      if (name === './pdf-url') return {
        validatePublicPdfUrl: async value => {
          const url = new URL(value);
          if (url.hostname === '127.0.0.1') throw new Error('URL PDF non valido.');
          return url;
        },
      };
      throw new Error(`Unexpected import ${name}`);
    },
  };
  runInNewContext(compiled, context);
  return context.exports.downloadPublicPdf;
}

test('public PDF download reads bounded response streams', async () => {
  const download = loadDownloader(async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(Uint8Array.of(1, 2));
      controller.enqueue(Uint8Array.of(3, 4));
      controller.close();
    },
  })));
  const bytes = await download(new URL('https://events.example/program.pdf'));
  assert.deepEqual([...bytes], [1, 2, 3, 4]);
});

test('oversized streams are canceled without reading the remaining body', async () => {
  let canceled = false;
  const download = loadDownloader(async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(10 * 1024 * 1024 + 1));
      controller.enqueue(Uint8Array.of(9));
    },
    cancel() {
      canceled = true;
    },
  })));
  await assert.rejects(download(new URL('https://events.example/program.pdf')), /10 MB/);
  assert.equal(canceled, true);
});

test('advertised oversized PDF responses are canceled before reading', async () => {
  let canceled = false;
  const download = loadDownloader(async () => new Response(new ReadableStream({
    cancel() {
      canceled = true;
    },
  }), { headers: { 'content-length': String(10 * 1024 * 1024 + 1) } }));
  await assert.rejects(download(new URL('https://events.example/program.pdf')), /10 MB/);
  assert.equal(canceled, true);
});

test('redirect targets are revalidated before the next request', async () => {
  let requests = 0;
  const download = loadDownloader(async () => {
    requests++;
    return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private.pdf' } });
  });
  await assert.rejects(download(new URL('https://events.example/program.pdf')), /URL PDF non valido/);
  assert.equal(requests, 1);
});
