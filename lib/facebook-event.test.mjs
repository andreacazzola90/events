import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as facebookEvent from './facebook-event.ts';

const { hasFacebookEventDetails, isFacebookEventSource, normalizeFacebookEventUrl } = facebookEvent;

test('normalizes the supplied Facebook event URL without tracking', () => {
  const original = 'https://www.facebook.com/events/1354941083239823/?acontext=%7B%22event_action_history%22%3A[%7B%22surface%22%3A%22home%22%7D%2C%7B%22mechanism%22%3A%22your_upcoming_events_unit%22%2C%22surface%22%3A%22bookmark%22%7D]%2C%22ref_notif_type%22%3Anull%7D';
  assert.equal(normalizeFacebookEventUrl(original), 'https://www.facebook.com/events/1354941083239823/');
  assert.equal(normalizeFacebookEventUrl('http://m.facebook.com/events/concerto/1354941083239823/?ref=share#details'),
    'https://www.facebook.com/events/1354941083239823/');
});

test('preserves short-link resolution and unrelated URL parameters', () => {
  for (const url of ['https://fb.me/e/abc123?ref=share', 'https://events.example/show?next=facebook.com', 'https://www.facebook.com/share/abc/?ref=share']) {
    assert.equal(normalizeFacebookEventUrl(url), url);
  }
  for (const url of ['https://facebook.com/events/1', 'https://m.facebook.com/events/1', 'https://fb.com/events/1', 'https://fb.me/e/abc', 'https://facebook.com./events/1']) {
    assert.equal(isFacebookEventSource(url), true);
  }
  for (const url of ['https://notfacebook.com/events/1', 'https://facebook.com.example/events/1', 'https://example.com/facebook.com']) {
    assert.equal(isFacebookEventSource(url), false);
  }
});

test('recognizes Italian, English and structured event dates without rejecting a login modal', () => {
  for (const date of ['2026-11-20T21:00:00', '20 novembre 2026', 'November 20, 2026', '20 nov', '20/11/2026', 'domani']) {
    assert.equal(hasFacebookEventDetails(`Concerto d'autunno\n${date}\nTeatro Civico\nAccedi a Facebook`), true, date);
  }
});

test('rejects generic login, unavailable pages and title-only previews before AI extraction', () => {
  for (const text of ['', 'Facebook\n20 novembre 2026', 'Facebook - Log In or Sign Up\n20/11/2026', 'Accedi a Facebook\nConcerto 20 novembre 2026', "Content isn't available\n2026-11-20", 'Concerto\nAccedi per vedere i dettagli']) {
    assert.equal(hasFacebookEventDetails(text), false, text);
  }
});

const compiled = ts.transpileModule(readFileSync(new URL('./event-processor.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadProcessor({ browserText, httpText = '', browserFailure = false }) {
  const navigations = [];
  const prompts = [];
  const canonical = 'https://www.facebook.com/events/1354941083239823/';
  const page = {
    setRequestInterception: async () => {},
    on() {},
    setUserAgent: async () => {},
    setExtraHTTPHeaders: async () => {},
    goto: async url => navigations.push(url),
    url: () => canonical,
    evaluate: async callback => callback.toString().includes('const candidates') ? [] : 'Accedi a Facebook',
    content: async () => browserText,
    accessibility: { snapshot: async () => ({ name: 'Login boilerplate '.repeat(100) }) },
    screenshot: async () => Buffer.from(''),
  };
  class Groq {
    chat = { completions: { create: async request => {
      prompts.push(request.messages);
      return { choices: [{ message: { content: JSON.stringify({
        title: 'Concerto', description: 'Musica dal vivo', date: '2026-11-20', time: '21:00',
        location: 'Teatro Civico', organizer: 'Associazione', category: 'musica', price: 'Gratuito',
      }) } }] };
    } } };
  }
  const context = {
    exports: {}, URL, AbortSignal, Buffer, Blob, File,
    process: { env: { GROQ_API_SECRET_KEY: 'test-key' } },
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (callback, ms) => ms >= 28000 ? 0 : setTimeout(callback, 0),
    clearTimeout,
    require: name => {
      if (name === 'groq-sdk') return { __esModule: true, default: Groq };
      if (name === './facebook-event') return facebookEvent;
      if (name === './http-scraper') return {
        htmlToEventText: text => text,
        httpScraper: async () => {
          if (!httpText) throw new Error('HTTP unavailable');
          return { pageText: httpText, finalImageUrl: null };
        },
      };
      if (name === './browser-vercel') return {
        getBrowser: async () => {
          if (browserFailure) throw new Error('shared libraries unavailable');
          return { newPage: async () => page };
        },
        closeBrowser: async () => {},
      };
      if (name.endsWith('/ocr-simple')) return { extractTextFromImageSimple: async () => '' };
      if (name.endsWith('/ocr')) return {};
      if (name.endsWith('/image-utils')) return { compressImage: async file => file };
      if (name === './event-display') return { splitEventsByTime: events => events };
      if (name === './event-hints') return { buildEventExtractionHints: () => '' };
      if (name === './google-search') return { isWebSearchConfigured: () => false };
      if (name === './event-image') return { selectEventImage: () => null };
      if (name === './event-scan-agents') return {
        completeMissingEventFields: async event => ({ event, agent: { status: 'completed' } }),
        SCAN_AGENT_VERSION: 'test',
      };
      if (name === './pdf-url') return {};
      if (name === './groq-rate-limit') return { withGroqRateLimit: async (_model, complete) => complete({}) };
      throw new Error(`Unexpected import ${name}`);
    },
  };
  vm.runInNewContext(compiled, context);
  return { process: context.exports.processEventLink, navigations, prompts, canonical };
}

for (const browserFailure of [false, true]) {
  test(`Facebook scan reaches AI extraction with canonical source (HTTP fallback: ${browserFailure})`, async () => {
    const text = 'Concerto\n20 novembre 2026 ore 21:00 al Teatro Civico\nAccedi a Facebook';
    const processor = loadProcessor({ browserText: text, httpText: text, browserFailure });
    const result = await processor.process(`${processor.canonical}?acontext=tracking`, { verbose: false });
    assert.equal(result.events[0].title, 'Concerto');
    assert.equal(result.events[0].sourceUrl, processor.canonical);
    assert.match(processor.prompts[0][1].content, /20 novembre 2026/);
    assert.doesNotMatch(processor.prompts[0][1].content, /Login boilerplate/);
    if (!browserFailure) assert.deepEqual(processor.navigations, [processor.canonical]);
  });
}

test('Facebook login pages never reach AI extraction even if the HTTP fallback contains long boilerplate', async () => {
  const processor = loadProcessor({
    browserText: 'Accedi a Facebook\n20 novembre 2026',
    httpText: `Facebook\n${'Accedi per continuare. '.repeat(30)} 20 novembre 2026`,
  });
  await assert.rejects(processor.process(processor.canonical, { verbose: false }), /Facebook.*screenshot/);
  assert.equal(processor.prompts.length, 0);
});
