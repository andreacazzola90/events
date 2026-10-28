import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const modules = new Map();
function loadModule(filename) {
  const absolute = path.resolve(import.meta.dirname, filename);
  if (modules.has(absolute)) return modules.get(absolute).exports;
  const loadedModule = { exports: {} };
  modules.set(absolute, loadedModule);
  const { outputText } = ts.transpileModule(readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const localRequire = (specifier) => specifier.startsWith('.')
    ? loadModule(path.resolve(path.dirname(absolute), `${specifier}.ts`))
    : require(specifier);
  vm.runInThisContext(`(function(require,module,exports){${outputText}\n})`, { filename: absolute })(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const { publicPageMetadata, isPublicIndexingAllowed, resolveSeoImage, serializeJsonLd, getWebSiteJsonLd } = loadModule('seo-metadata.ts');

test('public metadata owns canonical, localized social cards and the global fallback', () => {
  const original = process.env.NEXT_PUBLIC_SITE_URL;
  const originalEnvironment = process.env.VERCEL_ENV;
  try {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://configured.example/';
    process.env.VERCEL_ENV = 'production';
    const metadata = publicPageMetadata({ title: 'Concerto', description: 'Musica live', path: '/events/concerto-42' });
    assert.equal(metadata.title, 'Concerto');
    assert.equal(metadata.alternates.canonical, 'https://configured.example/events/concerto-42');
    assert.equal(metadata.openGraph.url, metadata.alternates.canonical);
    assert.equal(metadata.openGraph.locale, 'it_IT');
    assert.equal(metadata.openGraph.images[0].url, 'https://configured.example/opengraph-image');
    assert.deepEqual(metadata.twitter.images, ['https://configured.example/opengraph-image']);
    assert.deepEqual(metadata.robots, { index: true, follow: true });
    process.env.VERCEL_ENV = 'preview';
    assert.deepEqual(publicPageMetadata({ title: 'Mappa', description: 'Eventi', path: '/mappa' }).robots, { index: false, follow: false });
    assert.equal(getWebSiteJsonLd().url, 'https://configured.example/');
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = original;
    if (originalEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalEnvironment;
  }
});

test('indexing excludes Vercel nonproduction without excluding local or production', () => {
  for (const environment of ['preview', 'development', 'unexpected']) {
    assert.equal(isPublicIndexingAllowed({ VERCEL_ENV: environment }), false);
  }
  assert.equal(isPublicIndexingAllowed({}), true);
  assert.equal(isPublicIndexingAllowed({ VERCEL_ENV: 'production' }), true);
});

test('images use only usable public HTTP URLs or same-site paths', () => {
  assert.match(resolveSeoImage('/uploads/poster.jpg'), /^https:\/\/.+\/uploads\/poster.jpg$/);
  assert.equal(resolveSeoImage('https://cdn.example/poster.jpg'), 'https://cdn.example/poster.jpg');
  for (const image of ['', '//other.example/a', '/\\other.example/a', 'javascript:alert(1)', 'data:image/png;base64,x', 'https://user:pass@example.com/a', 'not-an-image']) {
    assert.equal(resolveSeoImage(image), undefined);
  }
});

test('JSON-LD escapes script-closing markup and Unicode separators losslessly', () => {
  const payload = { name: '</script><script>alert(1)</script>', description: 'before\u2028middle\u2029after' };
  const serialized = serializeJsonLd(payload);
  assert.doesNotMatch(serialized, /<|\u2028|\u2029/);
  assert.match(serialized, /\\u003c\/script>/);
  assert.deepEqual(JSON.parse(serialized), payload);
});

const { getEventIdFromSlug, getEventPath, getEventStartDate, parseEventOffer, getEventMetadata, getEventJsonLd, getEventBreadcrumbJsonLd } = loadModule('event-seo.ts');
const event = {
  id: 42, title: 'Concerto in piazza', date: '2026-07-12', time: '21:30',
  description: 'Una serata di musica dal vivo.', location: 'Piazza Rossi, Schio',
  organizer: 'Associazione Musica', price: '10,50 EUR', imageUrl: '/uploads/poster.jpg',
  latitude: 45.713, longitude: 11.357, updatedAt: new Date('2026-06-10T12:00:00Z'),
};

test('slug IDs are strict positive database integers and canonical paths use the current title', () => {
  assert.equal(getEventIdFromSlug('old-title-42'), 42);
  assert.equal(getEventIdFromSlug('42'), 42);
  for (const slug of ['old-title-42junk', 'title-0', 'title-0042', 'title--1junk', 'title-2147483648', '9007199254740993', 'no-id']) {
    assert.equal(getEventIdFromSlug(slug), null);
  }
  assert.equal(getEventPath(event), '/events/concerto-in-piazza-42');
  assert.ok(String(getEventMetadata(event).alternates.canonical).endsWith(getEventPath(event)));
});

test('start dates retain Rome winter/summer offsets and supported stored date formats', () => {
  assert.equal(getEventStartDate('2026-07-12', '21:30'), '2026-07-12T21:30:00+02:00');
  assert.equal(getEventStartDate('12/01/2026', '9.05'), '2026-01-12T09:05:00+01:00');
  assert.equal(getEventStartDate('2026-01-12T00:00:00.000Z', '21:30'), '2026-01-12T21:30:00+01:00');
  assert.equal(getEventStartDate('2026-03-29', '01:30'), '2026-03-29T01:30:00+01:00');
  assert.equal(getEventStartDate('2026-03-29', '03:30'), '2026-03-29T03:30:00+02:00');
});

test('unknown, invalid, range and DST-ambiguous times never acquire an invented instant', () => {
  for (const time of [undefined, '', 'Non specificato', '25:30', '12:60', '21:300', '21:30 - 23:00', 'dalle 21:30', '21:30 circa']) {
    assert.equal(getEventStartDate('2026-07-12', time), '2026-07-12');
  }
  assert.equal(getEventStartDate('2026-03-29', '02:30'), '2026-03-29');
  assert.equal(getEventStartDate('2026-10-25', '02:30'), '2026-10-25');
  for (const date of ['31/02/2026', '2026-02-29', '', 'da definire', '2026-07-12junk', '2026-10-28T99:99:99Z', '2026-10-28T21:99:00Z']) {
    assert.equal(getEventStartDate(date, '21:30'), null);
  }
});

test('offers represent only explicit free entry or one exact EUR amount', () => {
  for (const price of ['Gratis', 'ingresso libero', 'Gratuito', 'free']) {
    assert.deepEqual(parseEventOffer(price), { '@type': 'Offer', price: 0, priceCurrency: 'EUR' });
  }
  for (const price of ['10,50 EUR', '\u20ac10.50', '10.50\u20ac']) {
    assert.deepEqual(parseEventOffer(price), { '@type': 'Offer', price: 10.5, priceCurrency: 'EUR' });
  }
  for (const price of ['', '10', 'offerta libera', 'da 10 EUR', '10-20 EUR', '10 EUR + prevendita', 'gratis bambini', '10 USD', '1.000 EUR', '1,000 EUR', '-5 EUR', '9007199254740993 EUR']) {
    assert.equal(parseEventOffer(price), undefined);
  }
});

test('Event markup contains real public details, not inferred statuses, addresses or ticket sellers', () => {
  const json = getEventJsonLd(event);
  assert.equal(json['@type'], 'Event');
  assert.equal(json.name, event.title);
  assert.equal(json.description, event.description);
  assert.equal(json.startDate, '2026-07-12T21:30:00+02:00');
  assert.equal(json.dateModified, '2026-06-10T12:00:00.000Z');
  assert.equal(json.location.name, event.location);
  assert.deepEqual(json.location.geo, { '@type': 'GeoCoordinates', latitude: event.latitude, longitude: event.longitude });
  assert.deepEqual(json.organizer, { '@type': 'Organization', name: event.organizer });
  assert.deepEqual(json.offers, { '@type': 'Offer', price: 10.5, priceCurrency: 'EUR' });
  assert.equal(json.image.length, 1);
  assert.ok(json.image[0].endsWith('/uploads/poster.jpg'));
  for (const absent of ['endDate', 'eventStatus', 'eventAttendanceMode', 'isAccessibleForFree']) assert.equal(json[absent], undefined);
  assert.equal(json.location.address, undefined);
  for (const absent of ['availability', 'seller', 'url']) assert.equal(json.offers[absent], undefined);
  const breadcrumb = getEventBreadcrumbJsonLd(event);
  assert.deepEqual(breadcrumb.itemListElement.map((item) => item.position), [1, 2, 3]);
  assert.equal(breadcrumb.itemListElement[2].item, json.url);
  assert.ok(breadcrumb.itemListElement[1].item.endsWith('/eventi'));
});

test('incomplete optional data stays omitted and missing required data suppresses Event markup', () => {
  const json = getEventJsonLd({ ...event, description: '', time: '', organizer: 'Non specificato', imageUrl: 'javascript:alert(1)', price: 'da 10 EUR', latitude: NaN, updatedAt: 'bad-date' });
  assert.equal(json.startDate, event.date);
  for (const absent of ['description', 'organizer', 'image', 'offers', 'dateModified']) assert.equal(json[absent], undefined);
  assert.equal(json.location.geo, undefined);
  for (const coordinates of [{ latitude: 91 }, { longitude: 181 }, { latitude: null }, { longitude: Infinity }]) {
    assert.equal(getEventJsonLd({ ...event, ...coordinates }).location.geo, undefined);
  }
  for (const required of [{ title: '' }, { title: 'non trovato' }, { date: 'bad-date' }, { location: '' }, { location: 'Non specificato' }, { location: 'non trovato' }, { id: 0 }]) {
    assert.equal(getEventJsonLd({ ...event, ...required }), null);
  }
  assert.equal(getEventJsonLd({ ...event, price: 'gratis' }).isAccessibleForFree, true);
  const missingDetails = getEventJsonLd({ ...event, organizer: 'non trovato', description: 'non trovato' });
  assert.equal(missingDetails.organizer, undefined);
  assert.equal(missingDetails.description, undefined);
});

function loadEventPage(storedEvent) {
  const calls = { lookups: 0, related: 0, session: 0, caches: 0 };
  const navigation = {};
  const mocks = {
    react: {
      ...React,
      cache: (callback) => {
        calls.caches += 1;
        const requestCache = new Map();
        return (slug) => {
          if (!requestCache.has(slug)) requestCache.set(slug, callback(slug));
          return requestCache.get(slug);
        };
      },
    },
    'next/image': ({ src, alt }) => React.createElement('img', { src, alt }),
    'next/navigation': {
      notFound: () => { throw Object.assign(new Error('notFound'), { code: 404 }); },
      permanentRedirect: (url) => { throw Object.assign(new Error('permanentRedirect'), { code: 308, url }); },
    },
    '../../components/EventIcons': {
      CalendarIcon: () => null, ClockIcon: () => null, MapPinIcon: () => null,
    },
    '../../components/TransitionLink': {
      TransitionLink: ({ children, ...props }) => React.createElement('a', props, children),
    },
    '../../components/FavoriteButton': () => null,
    '../../lib/prisma': {
      prisma: { event: {
        findUnique: async ({ where }) => { calls.lookups += 1; navigation.lookupId = where.id; return storedEvent; },
        findMany: async () => { calls.related += 1; return []; },
      } },
    },
    'next-auth/next': { getServerSession: async () => { calls.session += 1; return null; } },
    '../../../pages/api/auth/[...nextauth]': { authOptions: {} },
    '../../../lib/event-seo': loadModule('event-seo.ts'),
    '../../../lib/seo-metadata': loadModule('seo-metadata.ts'),
    '../../../lib/slug-utils': loadModule('slug-utils.ts'),
  };
  const absolute = path.resolve(import.meta.dirname, '../app/events/[slug]/page.tsx');
  const { outputText } = ts.transpileModule(readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  const loadedModule = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier in mocks) return mocks[specifier];
    if (specifier === 'react/jsx-runtime') return require(specifier);
    throw new Error(`Unexpected dependency in isolated page test: ${specifier}`);
  };
  vm.runInThisContext(`(function(require,module,exports){${outputText}\n})`, { filename: absolute })(localRequire, loadedModule, loadedModule.exports);
  return { page: loadedModule.exports, calls, navigation };
}

test('server-rendered event HTML includes safe Event/breadcrumb markup and semantic dates with a shared cached lookup', async () => {
  const hostile = { ...event, description: '</script>\u2028<script>alert(1)</script>\u2029tail', media: [] };
  const { page, calls, navigation } = loadEventPage(hostile);
  const params = Promise.resolve({ slug: 'concerto-in-piazza-42' });
  const metadata = await page.generateMetadata({ params });
  const html = renderToStaticMarkup(await page.default({ params }));
  assert.equal(calls.caches, 1);
  assert.equal(calls.lookups, 1);
  assert.equal(navigation.lookupId, 42);
  assert.equal(calls.session, 1);
  assert.match(html, /<h1[^>]*>Concerto in piazza<\/h1>/);
  assert.match(html, /<time dateTime="2026-07-12">2026-07-12<\/time>/);
  assert.match(html, /<time dateTime="2026-07-12T21:30:00\+02:00">21:30<\/time>/);
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  const [eventMarkup, breadcrumbs] = scripts.map((match) => JSON.parse(match[1]));
  assert.equal(eventMarkup.description, hostile.description);
  assert.equal(eventMarkup.url, metadata.alternates.canonical);
  assert.equal(breadcrumbs.itemListElement[2].item, metadata.alternates.canonical);
  assert.doesNotMatch(html, /<script>alert/);
});

test('old aliases permanently redirect before session or related reads', async () => {
  const { page, calls } = loadEventPage(event);
  const params = Promise.resolve({ slug: 'vecchio-titolo-42' });
  const metadata = await page.generateMetadata({ params });
  assert.ok(metadata.alternates.canonical.endsWith('/events/concerto-in-piazza-42'));
  await assert.rejects(page.default({ params }), { code: 308, url: '/events/concerto-in-piazza-42' });
  assert.equal(calls.lookups, 1);
  assert.equal(calls.session, 0);
  assert.equal(calls.related, 0);
});

test('invalid slugs and absent records take the noindex 404 path without unrelated reads', async () => {
  for (const slug of ['concerto-42junk', 'concerto-2147483648', 'missing-42']) {
    const { page, calls } = loadEventPage(null);
    const params = Promise.resolve({ slug });
    const metadata = await page.generateMetadata({ params });
    assert.deepEqual(metadata.robots, { index: false, follow: false, googleBot: { index: false, follow: false } });
    assert.ok(metadata.alternates.canonical.endsWith(`/events/${slug}`));
    await assert.rejects(page.default({ params }), { code: 404 });
    assert.equal(calls.lookups, slug === 'missing-42' ? 1 : 0);
    assert.equal(calls.session, 0);
    assert.equal(calls.related, 0);
  }
});

test('unrepresentable event data omits Event JSON-LD but keeps the existing page content', async () => {
  const { page } = loadEventPage({ ...event, date: 'da definire', time: 'non specificato', media: [] });
  const html = renderToStaticMarkup(await page.default({ params: Promise.resolve({ slug: 'concerto-in-piazza-42' }) }));
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  assert.equal(JSON.parse(scripts[0][1])['@type'], 'BreadcrumbList');
  assert.match(html, /da definire/);
  assert.doesNotMatch(html, /<time/);
});