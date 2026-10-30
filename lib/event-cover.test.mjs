import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';
import sharp from 'sharp';
import * as network from './event-cover-network.ts';
import * as eventImage from './event-image.ts';

const compiled = ts.transpileModule(readFileSync(new URL('./event-cover.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

function loadCover(overrides = {}, env = {}) {
  const context = {
    exports: {}, process: { env }, Buffer, URL, Request, Response, AbortSignal: overrides.AbortSignal ?? AbortSignal, console,
    require: name => {
      if (name === 'node:crypto') return crypto;
      if (name === 'sharp') return sharp;
      if (name === './event-cover-network') return { ...network, ...overrides.network };
      if (name === './event-image') return eventImage;
      if (name === './google-search') return {
        isWebSearchConfigured: () => false, webSearch: async () => [], ...overrides.search,
      };
      throw new Error(`Unexpected import: ${name}`);
    },
  };
  vm.runInNewContext(compiled, context);
  return context.exports;
}

const input = { title: 'Festival del teatro', date: '2026-10-28', location: 'Schio' };
const payload = { title: input.title, sourceUrl: 'https://example.com/event', imageUrl: 'https://example.com/poster.jpg' };
const signal = () => AbortSignal.timeout(2000);
const bitmap = () => sharp({ create: { width: 400, height: 300, channels: 3, background: '#d83643' } }).png().toBuffer();

test('accepts only bounded string event fields, never OCR, screenshot or extra fields', () => {
  const cover = loadCover();
  assert.deepEqual({ ...cover.parseCoverSearchInput(input) }, input);
  for (const value of [
    null, [], {}, { ...input, rawText: 'private OCR' }, { ...input, screenshot: 'data:image/jpeg;base64,abc' },
    { ...input, title: {} }, { ...input, date: 2026 }, { ...input, location: ['Schio'] },
    { ...input, title: 'x'.repeat(161) }, { ...input, date: 'x'.repeat(41) },
    { ...input, location: 'x'.repeat(161) }, { ...input, title: ' ' },
    { ...input, constructor: 'extra' }, { ...input, toString: 'extra' },
    JSON.parse('{"title":"Evento","date":"","location":"","__proto__":"extra"}'),
  ]) assert.throws(() => cover.parseCoverSearchInput(value));
});

test('sanitizes controls, search operators, URLs, email, phone and handles before querying', async () => {
  const cover = loadCover();
  let query;
  const providers = {
    configured: () => true,
    search: async value => { query = value; return []; },
    fetch: async () => { throw new Error('Unexpected download'); },
  };
  await cover.searchEventCovers({ ...input, title: 'Teatro\n\u202e site:private @account name@example.com https://private.test +39 333 123 4567' }, signal(), providers);
  assert.equal(query, '"Teatro site private" Schio locandina');
});

test('tokens expire, reject tampering and are portable across bundles with the existing auth secret', () => {
  const env = { NEXTAUTH_SECRET_KEY: 'test-secret-only-not-a-real-credential' };
  const cover = loadCover({}, env);
  const token = cover.signCoverCandidate(payload, 1000);
  assert.equal(cover.verifyCoverCandidate(token, 1001).imageUrl, payload.imageUrl);
  assert.equal(loadCover({}, env).verifyCoverCandidate(token, 1001).sourceUrl, payload.sourceUrl);
  assert.throws(() => cover.verifyCoverCandidate(token, 301000));
  assert.throws(() => cover.verifyCoverCandidate(token.replace(/^./, token[0] === 'a' ? 'b' : 'a'), 1001));
  assert.throws(() => cover.verifyCoverCandidate('x'.repeat(9000)));
  assert.throws(() => loadCover().verifyCoverCandidate(token, 1001));
  const privateToken = cover.signCoverCandidate({ ...payload, imageUrl: 'http://[::ffff:7f00:1]/a' }, 1000);
  assert.throws(() => cover.verifyCoverCandidate(privateToken, 1001));
});

test('short phone numbers are removed while ISO and slash dates remain searchable', () => {
  const cover = loadCover();
  const parsed = cover.parseCoverSearchInput({ title: 'Concerto info 02 234567', date: '2026-10-28', location: 'Schio 3331234' });
  assert.equal(parsed.title, 'Concerto info');
  assert.equal(parsed.location, 'Schio');
  assert.equal(parsed.date, '2026-10-28');
  assert.equal(cover.parseCoverSearchInput({ ...input, date: '28/10/2026' }).date, '28/10/2026');
});

test('web provider failures can be reported explicitly without changing legacy empty fallback', async () => {
  const code = ts.transpileModule(readFileSync(new URL('./google-search.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const context = { exports: {}, process: { env: { GOOGLE_API_SECRET_KEY: 'test-key', GOOGLE_CX: 'test-engine' } },
    console: { log() {}, warn() {} }, require: name => {
      assert.equal(name, 'axios');
      return { get: async () => { throw new Error('Provider denied'); }, isAxiosError: () => false };
    },
  };
  vm.runInNewContext(code, context);
  assert.equal((await context.exports.webSearch('Concerto')).length, 0);
  await assert.rejects(context.exports.webSearch('Concerto', { throwOnFailure: true }), /Web search unavailable/);
  const cover = loadCover();
  const reply = await cover.searchEventCovers(input, signal(), {
    configured: () => true,
    search: async (query, options) => {
      assert.equal(options.throwOnFailure, true);
      return context.exports.webSearch(query, options);
    },
    fetch: async () => { throw new Error('No download expected'); },
  });
  assert.equal(reply.status, 'failed');
});

test('normalizes valid bitmap to JPEG and strips metadata', async () => {
  const cover = loadCover();
  const source = await sharp(await bitmap()).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const jpeg = await cover.normalizeCoverImage(source, signal());
  const metadata = await sharp(jpeg).metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.width, 300);
  assert.equal(metadata.height, 400);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(metadata.orientation, undefined);
});

test('bounds normalized JPEG dimensions without enlarging or retaining PNG text metadata', async () => {
  const cover = loadCover();
  const source = await sharp({ create: { width: 4000, height: 3000, channels: 4, background: '#ff000080' } }).png().toBuffer();
  const metadata = await sharp(await cover.normalizeCoverImage(source, signal())).metadata();
  assert.equal(metadata.width, 2048);
  assert.equal(metadata.height, 1536);
  assert.equal(metadata.hasAlpha, false);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(cover.normalizeCoverImage(source, controller.signal));
});

test('rejects invalid bitmap, SVG, tiny dimensions, too many pixels and over 4MiB', async () => {
  const cover = loadCover();
  const small = await sharp({ create: { width: 159, height: 300, channels: 3, background: 'red' } }).png().toBuffer();
  const huge = await sharp({ create: { width: 4001, height: 4000, channels: 3, background: 'red' } }).png().toBuffer();
  for (const bytes of [Buffer.from('not an image'), Buffer.from('<svg width="400" height="300"></svg>'), small, huge, Buffer.alloc(4 * 1024 * 1024 + 1)]) {
    await assert.rejects(cover.normalizeCoverImage(bytes, signal()));
  }
});

test('search fetches at most five pages, filters generic images and deduplicates URLs and pixels', async () => {
  const cover = loadCover();
  const bytes = await bitmap();
  const pages = [];
  const images = [];
  const reply = await cover.searchEventCovers(input, signal(), {
    configured: () => true,
    search: async () => Array.from({ length: 8 }, (_, index) => ({ link: `https://example.com/event/${index}`, title: `Festival del teatro ${index}`, snippet: 'Schio' })),
    fetch: async (url, options) => {
      if (options.kind === 'image') { images.push(url); return { bytes, url }; }
      pages.push(url);
      const image = pages.length === 1 ? 'logo.png' : pages.length < 4 ? 'poster.jpg' : 'same-pixels.jpg';
      return { bytes: Buffer.from(`<meta property="og:image" content="/${image}">`), url };
    },
  });
  assert.equal(reply.status, 'completed');
  assert.equal(pages.length, 5);
  assert.equal(images.length, 2);
  assert.equal(reply.candidates.length, 1);
  assert.deepEqual(Object.keys(reply.candidates[0]).sort(), ['id', 'previewUrl', 'sourceUrl', 'title']);
  const candidate = reply.candidates[0];
  assert.equal(candidate.sourceUrl, 'https://example.com/event/1');
  assert.equal(candidate.title, input.title);
  assert.match(candidate.previewUrl, /^\/api\/event-cover-image\?token=/);
  assert.equal(cover.verifyCoverCandidate(new URL(candidate.previewUrl, 'https://local.test').searchParams.get('token')).imageUrl, 'https://example.com/poster.jpg');
});

test('unconfigured, empty, failed, aborted and invalid input searches do not leak data', async () => {
  const cover = loadCover();
  const providers = { configured: () => false, search: async () => { throw new Error('not called'); }, fetch: async () => { throw new Error('not called'); } };
  assert.equal((await cover.searchEventCovers(input, signal(), providers)).status, 'not-configured');
  providers.configured = () => true;
  assert.equal((await cover.searchEventCovers(input, signal(), providers)).status, 'failed');
  providers.search = async () => [];
  assert.equal((await cover.searchEventCovers(input, signal(), providers)).status, 'completed');
  const controller = new AbortController();
  controller.abort();
  assert.equal((await cover.searchEventCovers(input, controller.signal, providers)).status, 'failed');
  assert.equal((await cover.searchEventCovers({ ...input, rawText: 'secret' }, signal(), providers)).status, 'failed');
});

test('rejects bad candidates, tolerates failed pages and resolves metadata against final page URL', async () => {
  const cover = loadCover();
  const bytes = await bitmap();
  const fetched = [];
  const reply = await cover.searchEventCovers(input, signal(), {
    configured: () => true,
    search: async () => ['bad-page', 'tiny-image', 'good-page', 'bad-page'].map(path => ({ link: `https://example.com/festival-del-teatro-schio/${path}` })),
    fetch: async (url, options) => {
      fetched.push(url);
      if (url.endsWith('bad-page')) throw new Error('Page unavailable');
      if (options.kind === 'image') return { bytes: url.endsWith('tiny.jpg') ? Buffer.from('broken image') : bytes, url };
      return { bytes: Buffer.from(`<meta property="og:image" content="${url.endsWith('tiny-image') ? 'tiny.jpg' : 'poster.jpg'}">`), url: 'https://example.com/redirected/event' };
    },
  });
  assert.equal(reply.status, 'completed');
  assert.equal(reply.candidates.length, 1);
  assert.equal(reply.candidates[0].sourceUrl, 'https://example.com/redirected/event');
  assert.ok(fetched.includes('https://example.com/redirected/poster.jpg'));
  assert.equal(fetched.filter(url => url.endsWith('bad-page')).length, 1);
});

function searchRequest(body = input, headers = {}, options = {}) {
  return new Request('https://events.example/api/event-cover-search', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body), ...options,
  });
}

test('POST enforces schema, streamed body limit, content type and origin without provider calls', async () => {
  let calls = 0;
  const cover = loadCover({ search: { isWebSearchConfigured: () => { calls++; return false; } } });
  for (const request of [
    searchRequest({ ...input, rawText: 'secret' }), searchRequest('not-json'), searchRequest('x'.repeat(2049)),
    searchRequest(input, { 'content-type': 'text/plain' }), searchRequest(input, { origin: 'https://attacker.example' }),
  ]) {
    const response = await cover.handleCoverSearch(request);
    assert.ok([400, 403].includes(response.status));
    assert.equal((await response.json()).status, 'failed');
  }
  assert.equal(calls, 0);
  const response = await cover.handleCoverSearch(searchRequest());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'not-configured');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('POST reads chunked bodies with no trusted content-length and cancels stalled body on abort', async () => {
  const cover = loadCover();
  const oversized = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(1024));
    controller.enqueue(new Uint8Array(1025));
    controller.close();
  } });
  const response = await cover.handleCoverSearch(searchRequest('', { 'content-length': '1' }, { body: oversized, duplex: 'half' }));
  assert.equal(response.status, 400);
  const controller = new AbortController();
  let canceled = false;
  const stalled = new ReadableStream({ cancel() { canceled = true; } });
  const pending = cover.handleCoverSearch(searchRequest('', {}, { body: stalled, duplex: 'half', signal: controller.signal }));
  controller.abort();
  assert.equal((await pending).status, 400);
  assert.equal(canceled, true);
});

test('GET only serves a signed, revalidated image as a metadata-free JPEG', async () => {
  const bytes = await bitmap();
  const calls = [];
  const cover = loadCover({ network: { fetchCoverResource: async (url, options) => {
    calls.push({ url, options });
    return { bytes, url };
  } } });
  const token = cover.signCoverCandidate(payload);
  const base = 'https://events.example/api/event-cover-image';
  for (const query of ['?url=https://example.com/a', '?token=forged', `?token=${token}&url=https://example.com`]) {
    assert.equal((await cover.handleCoverImage(new Request(base + query))).status, 404);
  }
  assert.equal(calls.length, 0);
  const response = await cover.handleCoverImage(new Request(`${base}?token=${token}`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.exif, undefined);
  assert.equal(calls[0].url, payload.imageUrl);
  assert.equal(calls[0].options.maxBytes, 4 * 1024 * 1024);
});

test('GET rejects expired/duplicate tokens, cross-site requests and unsafe or changed upstream images', async () => {
  let calls = 0;
  const cover = loadCover({ network: { fetchCoverResource: async () => { calls++; throw new Error('Non-public DNS answer'); } } });
  const token = cover.signCoverCandidate(payload);
  const url = `https://events.example/api/event-cover-image?token=${token}`;
  assert.equal((await cover.handleCoverImage(new Request(`${url}&token=${token}`))).status, 404);
  assert.equal((await cover.handleCoverImage(new Request(url, { headers: { 'sec-fetch-site': 'cross-site' } }))).status, 404);
  const expired = cover.signCoverCandidate(payload, Date.now() - 301000);
  assert.equal((await cover.handleCoverImage(new Request(url.replace(token, expired)))).status, 404);
  assert.equal(calls, 0);
  assert.equal((await cover.handleCoverImage(new Request(url))).status, 404);
  assert.equal(calls, 1);
  const changed = loadCover({ network: { fetchCoverResource: async () => ({ bytes: Buffer.from('html instead of image'), url: payload.imageUrl }) } });
  const changedToken = changed.signCoverCandidate(payload);
  assert.equal((await changed.handleCoverImage(new Request(url.replace(token, changedToken)))).status, 404);
});

test('search and image handlers propagate fixed total budgets and abort provider/download work', async () => {
  const durations = [];
  const controller = new AbortController();
  const budgetSignals = {
    any: AbortSignal.any.bind(AbortSignal),
    timeout: duration => { durations.push(duration); return controller.signal; },
  };
  const cover = loadCover({ AbortSignal: budgetSignals, search: {
    isWebSearchConfigured: () => true,
    webSearch: async (_query, options) => {
      assert.equal(options.signal.aborted, false);
      controller.abort();
      return new Promise(() => {});
    },
  } });
  const response = await cover.handleCoverSearch(searchRequest());
  assert.equal((await response.json()).status, 'failed');
  assert.deepEqual(durations, [20000, 20000]);
  const imageController = new AbortController();
  const image = loadCover({ AbortSignal: {
    any: AbortSignal.any.bind(AbortSignal), timeout: duration => {
      assert.equal(duration, 10000);
      return imageController.signal;
    },
  }, network: { fetchCoverResource: async (_url, options) => {
    imageController.abort();
    options.signal.throwIfAborted();
  } } });
  const token = image.signCoverCandidate(payload);
  assert.equal((await image.handleCoverImage(new Request(`https://events.example/api/event-cover-image?token=${token}`))).status, 404);
});

test('route concurrency and per-client rate controls reject excess work', async () => {
  const cover = loadCover({ search: { isWebSearchConfigured: () => true, webSearch: (_query, options) => new Promise(resolve => {
    options.signal.addEventListener('abort', () => resolve([]), { once: true });
  }) } });
  const controllers = Array.from({ length: 4 }, () => new AbortController());
  const pending = controllers.map(controller => cover.handleCoverSearch(searchRequest(input, {}, { signal: controller.signal })));
  assert.equal((await cover.handleCoverSearch(searchRequest())).status, 429);
  controllers.forEach(controller => controller.abort());
  await Promise.all(pending);
  const limited = loadCover();
  for (let index = 0; index < 8; index++) assert.equal((await limited.handleCoverSearch(searchRequest())).status, 200);
  const response = await limited.handleCoverSearch(searchRequest());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
});

test('Google cover search requests image results and keeps the source page', async () => {
  const code = ts.transpileModule(readFileSync(new URL('./google-search.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  let request;
  const context = {
    exports: {}, process: { env: { GOOGLE_API_SECRET_KEY: 'test-key', GOOGLE_CX: 'test-engine' } },
    console: { log() {}, warn() {} }, require: name => {
      assert.equal(name, 'axios');
      return {
        get: async (url, options) => {
          request = { url, params: options.params };
          return { data: { items: [{
            title: 'Locandina evento', link: 'https://images.example/poster.jpg', snippet: 'Data e luogo',
            image: { contextLink: 'https://events.example/event' },
          }] } };
        },
        isAxiosError: () => false,
      };
    },
  };
  vm.runInNewContext(code, context);
  const results = await context.exports.webImageSearch('Festival Schio locandina');
  assert.equal(request.url, 'https://www.googleapis.com/customsearch/v1');
  assert.equal(request.params.searchType, 'image');
  assert.equal(request.params.safe, 'active');
  assert.equal(results[0].imageUrl, 'https://images.example/poster.jpg');
  assert.equal(results[0].link, 'https://events.example/event');
});

test('cover search downloads direct image results without scraping a generic page', async () => {
  const cover = loadCover();
  const bytes = await bitmap();
  const fetched = [];
  const reply = await cover.searchEventCovers(input, signal(), {
    configured: () => true,
    search: async () => { throw new Error('Generic page search should not run'); },
    imageSearch: async () => [{ title: 'Locandina Festival del Teatro Schio', link: 'https://events.example/event', imageUrl: 'https://images.example/poster.jpg' }],
    fetch: async (url, options) => { fetched.push({ url, kind: options.kind }); return { bytes, url }; },
  });
  assert.equal(reply.status, 'completed');
  assert.equal(reply.candidates.length, 1);
  assert.equal(reply.candidates[0].sourceUrl, 'https://events.example/event');
  assert.deepEqual(fetched, [{ url: 'https://images.example/poster.jpg', kind: 'image' }]);
});
test('cover search keeps only images of the same event, checking the source page when needed', async () => {
  const cover = loadCover();
  const bytes = await bitmap();
  const fetched = [];
  const reply = await cover.searchEventCovers(input, signal(), {
    configured: () => true,
    search: async () => [],
    imageSearch: async () => [
      { title: 'Teatro all aperto foto stock', link: 'https://stock.example/theatre', imageUrl: 'https://stock.example/a.jpg' },
      { title: 'Festival della musica Schio', link: 'https://other.example/music', imageUrl: 'https://other.example/b.jpg' },
      { title: 'Festival del teatro - locandina', link: 'https://www.freepik.com/festival-teatro-schio', imageUrl: 'https://img.freepik.com/d.jpg' },
      { title: 'Festival del teatro a Pisa', link: 'https://pisa.example/festival', imageUrl: 'https://pisa.example/e.jpg' },
      { title: 'IMG_2041', link: 'https://comune.example/news/42', imageUrl: 'https://comune.example/c.jpg' },
    ],
    fetch: async (url, options) => {
      fetched.push(url);
      if (options.kind === 'image') return { bytes, url };
      if (url === 'https://comune.example/news/42') return { bytes: Buffer.from('<title>Festival del Teatro 2026</title><p>In piazza a Schio</p>'), url };
      if (url === 'https://pisa.example/festival') return { bytes: Buffer.from('<title>Festival del teatro</title><p>Pisa, 3 maggio</p>'), url };
      return { bytes: Buffer.from('<title>Altro</title>'), url };
    },
  });
  assert.equal(reply.status, 'completed');
  assert.deepEqual([...reply.candidates.map(candidate => candidate.sourceUrl)], ['https://comune.example/news/42']);
  assert.ok(!fetched.includes('https://stock.example/a.jpg'));
  assert.ok(!fetched.includes('https://other.example/b.jpg'));
  assert.ok(!fetched.some(url => url.includes('freepik') || url === 'https://pisa.example/e.jpg'));
  assert.equal(cover.mentionsEventContext({ date: '2026-10-31', location: '' }, 'Sabato 31 ottobre in centro'), true);
  assert.equal(cover.mentionsOtherEdition('2026-05-03', 'Pisa Book Festival 2022'), true);
  assert.equal(cover.mentionsOtherEdition('2026-05-03', 'Pisa Book Festival 2026', 'https://x.example/2025/news'), false);
  assert.equal(cover.mentionsOtherEdition('', 'Pisa Book Festival 2022'), false);
  assert.equal(cover.mentionsEventContext({ date: '', location: 'Via Roma 1, Schio' }, 'Hallovin a Pisa'), false);
  assert.equal(cover.mentionsEventTitle('Hallovin 26', 'Hallovin a Schio'), true);
  assert.equal(cover.mentionsEventTitle('Festival del teatro', 'Teatro comunale'), false);
  assert.equal(cover.mentionsEventTitle('Festival del teatro', 'https://site.example/eventi/festival-del-teatro-2026'), true);
});
