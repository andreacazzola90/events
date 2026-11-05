import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./pdf-download.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadDownloader(fetchResource) {
  const context = {
    exports: {},
    AbortSignal,
    Buffer,
    URL,
    Uint8Array,
    Error,
    require: name => {
      if (name === './pdf-url') return {
        validatePublicPdfUrl: async value => {
          const url = new URL(value);
          if (url.hostname === '127.0.0.1') throw new Error('URL PDF non valido.');
          return url;
        },
      };
      if (name === './event-cover-network') return { fetchCoverResource: fetchResource };
      throw new Error(`Unexpected import ${name}`);
    },
  };
  runInNewContext(compiled, context);
  return context.exports.downloadPublicPdf;
}

test('public PDF download reads bounded response streams', async () => {
  let requestOptions;
  const download = loadDownloader(async (_url, options) => {
    requestOptions = options;
    return { bytes: Buffer.from('%PDF-1.7'), contentType: 'application/pdf', url: 'https://events.example/program.pdf' };
  });
  const bytes = await download(new URL('https://events.example/program.pdf'));
  assert.equal(Buffer.from(bytes).toString(), '%PDF-1.7');
  assert.equal(requestOptions.kind, 'scan');
  assert.equal(requestOptions.maxBytes, 10 * 1024 * 1024);
  assert.equal(requestOptions.maxRedirects, 5);
});

test('rejects resources that are not PDF content', async () => {
  const download = loadDownloader(async () => ({
    bytes: Buffer.from('<html>not a PDF</html>'),
    contentType: 'text/html',
    url: 'https://events.example/program.pdf',
  }));
  await assert.rejects(download(new URL('https://events.example/program.pdf')), /non ha restituito un PDF/);
});

test('rejects a PDF MIME response without a PDF signature', async () => {
  const download = loadDownloader(async () => ({
    bytes: Buffer.from('not a PDF'),
    contentType: 'application/pdf',
    url: 'https://events.example/program.pdf',
  }));
  await assert.rejects(download(new URL('https://events.example/program.pdf')), /non è un PDF valido/);
});

test('rejects an oversized resource using the pinned fetch byte limit', async () => {
  const download = loadDownloader(async (_url, options) => {
    assert.equal(options.maxBytes, 10 * 1024 * 1024);
    throw new Error('Resource too large');
  });
  await assert.rejects(download(new URL('https://events.example/program.pdf')), /10 MB/);
});
