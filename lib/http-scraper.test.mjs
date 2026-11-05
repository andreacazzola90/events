import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./http-scraper.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadScraper(fetch, validatePublicScanUrl) {
  const context = {
    exports: {},
    AbortController,
    Response,
    TextDecoder,
    URL,
    console: { log() {}, error() {} },
    fetch,
    setTimeout,
    clearTimeout,
    require: name => {
      if (name === './event-image') return { extractEventImageFromHtml: () => null };
      if (name === './pdf-url') return { validatePublicScanUrl };
      throw new Error(`Unexpected import ${name}`);
    },
  };
  runInNewContext(compiled, context);
  return context.exports.httpScraper;
}

test('HTTP link scraping validates each redirect before fetching its target', async () => {
  const validated = [];
  let requests = 0;
  const scrape = loadScraper(async () => {
    requests++;
    return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } });
  }, async value => {
    validated.push(value);
    if (new URL(value).hostname === '127.0.0.1') throw new Error('La fonte deve essere ospitata su un server pubblico.');
    return new URL(value);
  });
  await assert.rejects(scrape('https://events.example/program'), /pubblico/);
  assert.equal(requests, 1);
  assert.equal(validated.length, 2);
});

test('HTTP link scraping bounds response bodies without relying on content-length', async () => {
  let canceled = false;
  const scrape = loadScraper(async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
      controller.enqueue(new TextEncoder().encode('<html>too large</html>'));
    },
    cancel() {
      canceled = true;
    },
  })), async value => new URL(value));
  await assert.rejects(scrape('https://events.example/program'), /supera il limite/);
  assert.equal(canceled, true);
});

test('HTTP link scraping cancels a response advertised above the size limit', async () => {
  let canceled = false;
  const scrape = loadScraper(async () => new Response(new ReadableStream({
    cancel() {
      canceled = true;
    },
  }), { headers: { 'content-length': String(2 * 1024 * 1024 + 1) } }), async value => new URL(value));
  await assert.rejects(scrape('https://events.example/program'), /supera il limite/);
  assert.equal(canceled, true);
});
