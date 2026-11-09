import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import * as facebookEvent from './facebook-event.ts';

const source = readFileSync(new URL('./http-scraper.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadScraper(fetchResource) {
  const context = {
    exports: {},
    AbortController,
    console: { log() {}, error() {} },
    setTimeout,
    clearTimeout,
    require: name => {
      if (name === './event-image') return { extractEventImageFromHtml: () => null };
      if (name === './event-cover-network') return { fetchCoverResource: fetchResource };
      if (name === './facebook-event') return facebookEvent;
      throw new Error(`Unexpected import ${name}`);
    },
  };
  runInNewContext(compiled, context);
  return context.exports.httpScraper;
}

test('HTTP link scraping fetches only through the pinned public-resource helper', async () => {
  let request;
  const scrape = loadScraper(async (url, options) => {
    request = { url, options };
    return { bytes: Buffer.from('<html><title>Evento</title><body>Descrizione</body></html>'), url: 'https://events.example/program' };
  });
  const result = await scrape('https://events.example/program');
  assert.equal(request.url, 'https://events.example/program');
  assert.equal(request.options.kind, 'page');
  assert.equal(request.options.maxBytes, 2 * 1024 * 1024);
  assert.equal(request.options.maxRedirects, 5);
  assert.match(result.pageText, /Descrizione/);
});

test('HTTP link scraping exposes pinned-fetch failures', async () => {
  const scrape = loadScraper(async () => { throw new Error('Resource too large'); });
  await assert.rejects(scrape('https://events.example/program'), /Resource too large/);
});

test('Facebook public metadata and structured dates reach the extractor despite a login modal', async () => {
  const html = `<html><head><meta property="og:title" content="Concerto d'autunno">
    <meta property="og:description" content="Musica dal vivo al Teatro Civico">
    <script type="application/ld+json">{"@type":"Event","name":"Concerto d'autunno","startDate":"2026-11-20T21:00:00+01:00","location":{"name":"Teatro Civico"}}</script>
    </head><body><form>Accedi a Facebook</form></body></html>`;
  const scrape = loadScraper(async () => ({
    bytes: Buffer.from(html), url: 'https://www.facebook.com/events/1354941083239823/',
  }));
  const result = await scrape('https://www.facebook.com/events/1354941083239823/');
  assert.match(result.pageText, /2026-11-20/);
  assert.match(result.pageText, /Teatro Civico/);
  assert.doesNotMatch(result.pageText, /Accedi/);
});

for (const original of ['https://www.facebook.com/events/123/', 'https://fb.me/example', 'https://events.example/redirect']) {
  test(`Facebook login redirects fail explicitly for ${original}`, async () => {
    const scrape = loadScraper(async () => ({
      bytes: Buffer.from('<html><title>Accedi a Facebook</title><body>Accedi per continuare. 9 novembre 2026</body></html>'),
      url: 'https://www.facebook.com/login/?next=/events/123/',
    }));
    await assert.rejects(scrape(original), /Facebook.*screenshot/);
  });
}
