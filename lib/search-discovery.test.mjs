import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jsxRuntime = require('react/jsx-runtime');

function loadRoute(path, imports, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      assert.ok(name in imports, `Unexpected dependency: ${name}`);
      return imports[name];
    },
    ...globals,
  });
  return exports;
}

const origin = 'https://discovery.example';
const site = { siteUrl: (path = '/') => `${origin}${path}` };

function seoHelpers(environment = 'production') {
  return loadRoute('./seo-metadata.ts', { './site-url': site }, { process: { env: { VERCEL_ENV: environment } }, URL });
}

test('robots allows HTML noindex discovery and AI search while excluding operational APIs', () => {
  const result = loadRoute('../app/robots.ts', {
    '../lib/site-url': site,
    '../lib/seo-metadata': { isPublicIndexingAllowed: () => true },
  }).default();
  assert.equal(result.sitemap, `${origin}/sitemap.xml`);
  assert.equal(result.rules[0].userAgent, '*');
  assert.deepEqual([...result.rules[1].userAgent], [
    'OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot',
  ]);
  assert.deepEqual([...result.rules[0].disallow], [...result.rules[1].disallow]);
  assert.ok(result.rules[0].disallow.includes('/api/'));
  for (const path of ['/account', '/auth', '/admin', '/cron', '/me', '/crea', '/events/*/edit']) {
    assert.ok(!result.rules[0].disallow.includes(path));
  }
  assert.ok(!result.rules[0].disallow.some((path) => path.includes('_next')));
  assert.equal(existsSync(new URL('../public/robots.txt', import.meta.url)), false);
});

test('not-found metadata excludes Google explicitly while keeping a public navigation link', () => {
  const route = loadRoute('../app/not-found.tsx', {
    'react/jsx-runtime': jsxRuntime,
    'next/link': { default: 'a' },
  });
  assert.equal(route.metadata.robots.index, false);
  assert.equal(route.metadata.robots.googleBot.index, false);
  const html = require('react-dom/server').renderToStaticMarkup(jsxRuntime.jsx(route.default, {}));
  assert.match(html, /href="\/eventi"/);
});

test('preview robots disallows everything', () => {
  const result = loadRoute('../app/robots.ts', {
    '../lib/site-url': site,
    '../lib/seo-metadata': { isPublicIndexingAllowed: () => false },
  }).default();
  assert.equal(result.rules.disallow, '/');
  assert.equal(result.sitemap, undefined);
});

function sitemapRoute({ events = [], series = [], failEvents = false, failSeries = false, index = true } = {}) {
  const calls = [];
  const warnings = [];
  const route = loadRoute('../app/sitemap.ts', {
    './lib/prisma': { prisma: {
      event: { findMany: async (query) => {
        calls.push(['event', query]);
        if (failEvents) throw new Error('DATABASE_URL=secret');
        return events.slice(0, query.take);
      } },
      eventSeries: { findMany: async (query) => {
        calls.push(['series', query]);
        if (failSeries) throw new Error('DATABASE_URL=secret');
        return series.filter((item) => item.isPublished).slice(0, query.take);
      } },
    } },
    '../lib/slug-utils': { generateUniqueSlug: (title, id) => `${title.toLowerCase()}-${id}` },
    '../lib/site-url': site,
    '../lib/seo-metadata': { isPublicIndexingAllowed: () => index },
  }, { console: { warn: (...args) => warnings.push(args) } });
  return { sitemap: route.default, calls, warnings };
}

test('sitemap uses canonical event slugs and only published series with stable modification dates', async () => {
  const updatedAt = new Date('2026-10-25T10:00:00Z');
  const route = sitemapRoute({
    events: [{ id: 7, title: 'Concerto', updatedAt, eventSeriesId: 99 }],
    series: [
      { slug: 'festival', isPublished: true, updatedAt },
      { slug: 'private-title', isPublished: false, updatedAt },
    ],
  });
  const urls = await route.sitemap();
  assert.equal(urls.length, 10);
  assert.ok(urls.some((item) => item.url === `${origin}/events/concerto-7`));
  assert.ok(urls.some((item) => item.url === `${origin}/rassegne/festival`));
  assert.ok(!urls.some((item) => /private-title|\/crea|\/auth|\/admin|\/edit/.test(item.url)));
  assert.equal(urls.find((item) => item.url.endsWith('concerto-7')).lastModified, updatedAt);
  assert.ok(urls.slice(0, 8).every((item) => item.lastModified === undefined));
  assert.equal(route.calls[0][1].where.isPublished, true);
  assert.equal(route.calls[1][1].where, undefined);
});

test('database failure preserves static fallback and never logs database error details', async () => {
  const route = sitemapRoute({ failEvents: true, failSeries: true });
  assert.equal((await route.sitemap()).length, 8);
  assert.equal(route.warnings.length, 2);
  assert.ok(!JSON.stringify(route.warnings).includes('secret'));
  assert.ok(route.warnings.every((args) => args.length === 1));
});

test('sitemap survives partial database failure and respects the 50000 URL limit', async () => {
  const updatedAt = new Date('2026-10-25T10:00:00Z');
  const route = sitemapRoute({
    failSeries: true,
    events: Array.from({ length: 50_001 }, (_, id) => ({ id, title: 'Evento', updatedAt })),
  });
  assert.equal((await route.sitemap()).length, 50_000);
  assert.equal(route.calls[1][1].take, 49_993);
  assert.ok(JSON.stringify(route.warnings).includes('limit reached'));
  const seriesRoute = sitemapRoute({
    series: Array.from({ length: 50_001 }, (_, id) => ({ slug: `series-${id}`, isPublished: true, updatedAt })),
  });
  assert.equal((await seriesRoute.sitemap()).length, 50_000);
  assert.equal(seriesRoute.calls.length, 1);
});

test('preview sitemap does not query the database', async () => {
  const route = sitemapRoute({ index: false });
  assert.equal((await route.sitemap()).length, 0);
  assert.equal(route.calls.length, 0);
});

test('llms.txt is curated public Markdown with factual source guidance and absolute links', async () => {
  for (const index of [true, false]) {
    const response = loadRoute('../app/llms.txt/route.ts', {
      '../../lib/site-url': site,
      '../../lib/seo-metadata': { isPublicIndexingAllowed: () => index },
    }, { Response }).GET();
    assert.equal(response.headers.get('Content-Type'), 'text/plain; charset=utf-8');
    assert.match(response.headers.get('X-Robots-Tag'), /^noindex/);
    const body = await response.text();
    const links = [...body.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
    assert.ok(links.length >= 8);
    assert.ok(links.every((link) => link.startsWith(`${origin}/`)));
    assert.ok(!links.some((link) => /\/account|\/auth|\/admin|\/api|\/crea/.test(link)));
    assert.match(body, /fonte originale/);
    assert.match(body, /non standard/);
    assert.doesNotMatch(body, /DATABASE_URL|token|password/);
  }
});

test('public route metadata has distinct canonical and social URLs, including on previews', () => {
  const routes = [
    ['/eventi', 'layout'], ['/tutti-gli-eventi', 'layout'], ['/mappa', 'layout'],
    ['/estensione', 'page'], ['/versioni', 'page'], ['/ui-ux', 'page'], ['/rassegne', 'page'],
  ];
  for (const environment of ['production', 'preview']) {
    const helpers = seoHelpers(environment);
    for (const [path, file] of routes) {
      const { metadata } = loadRoute(`../app${path}/${file}.tsx`, {
        '../../lib/seo-metadata': helpers,
        'react/jsx-runtime': jsxRuntime,
        'next/link': {},
        'lucide-react': {},
        '@/lib/prisma': {},
        '@/lib/admin-auth': {},
        '../../lib/build-info': { appBuildInfo: {} },
        '../../lib/release-notes': { releaseNotes: [] },
        '../components/TransitionLink': {},
      });
      assert.equal(metadata.alternates.canonical, `${origin}${path}`);
      assert.equal(metadata.openGraph.url, metadata.alternates.canonical);
      assert.equal(metadata.openGraph.images[0].url, `${origin}/opengraph-image`);
      assert.equal(metadata.twitter.card, 'summary_large_image');
      assert.equal(metadata.robots.index, environment === 'production');
      assert.ok(metadata.title && metadata.description);
    }
  }
});

test('private and utility layouts remain noindex', () => {
  for (const path of ['account', 'auth', 'admin', 'cron', 'me', 'events/[slug]/edit', 'crea']) {
    const { metadata } = loadRoute(`../app/${path}/layout.tsx`, {
      '../../lib/seo-metadata': seoHelpers(),
    });
    assert.equal(metadata.robots.index, false, path);
    assert.equal(metadata.robots.follow, false, path);
  }
});

function seriesRoute(series) {
  const queries = [];
  const route = loadRoute('../app/rassegne/[slug]/page.tsx', {
    'react/jsx-runtime': jsxRuntime,
    'next/link': { default: 'a' },
    'next/navigation': { notFound: () => { throw new Error('NEXT_NOT_FOUND'); } },
    '@/lib/prisma': { prisma: { eventSeries: { findUnique: async (query) => {
      queries.push(query);
      return series;
    } } } },
    '../../../lib/seo-metadata': seoHelpers(),
    '../../../lib/site-url': site,
    '../../../lib/slug-utils': { generateUniqueSlug: (title, id) => `${title.toLowerCase()}-${id}` },
  });
  return { ...route, queries };
}

test('missing and draft series have generic noindex metadata and keep the page 404', async () => {
  for (const series of [null, { isPublished: false, title: 'Secret draft title' }]) {
    const route = seriesRoute(series);
    const input = { params: Promise.resolve({ slug: 'missing' }) };
    const metadata = await route.generateMetadata(input);
    assert.equal(metadata.robots.index, false);
    assert.ok(!JSON.stringify(metadata).includes('Secret'));
    await assert.rejects(() => route.default(input), /NEXT_NOT_FOUND/);
  }
});

test('published series canonical and JSON-LD use current slug and visible events without invented dates', async () => {
  const route = seriesRoute({
    slug: 'current-festival', title: 'Festival </script><script>alert(1)</script>',
    description: 'Programma pubblico', isPublished: true,
    events: [
      { id: 2, title: 'Secondo', date: '29/10/2026', time: '', location: '', category: '', description: '' },
      { id: 1, title: 'Primo', date: '2026-10-28', time: '', location: '', category: '', description: '' },
    ],
  });
  const input = { params: Promise.resolve({ slug: 'old-slug' }) };
  const metadata = await route.generateMetadata(input);
  assert.equal(metadata.alternates.canonical, `${origin}/rassegne/current-festival`);
  const tree = await route.default(input);
  const script = tree.props.children[0];
  assert.equal(script.type, 'script');
  const json = script.props.dangerouslySetInnerHTML.__html;
  assert.doesNotMatch(json, /<\/script>/);
  const graph = JSON.parse(json)['@graph'];
  assert.equal(graph[0]['@type'], 'CollectionPage');
  assert.equal(graph[0].url, metadata.alternates.canonical);
  assert.deepEqual(graph[0].mainEntity.itemListElement.map((item) => item.url), [
    `${origin}/events/primo-1`, `${origin}/events/secondo-2`,
  ]);
  assert.equal(graph[1]['@type'], 'BreadcrumbList');
  assert.doesNotMatch(json, /startDate|endDate|EventSeries/);
});

test('social fallback renders real nonblank 1200x630 PNG bytes locally', async () => {
  const { default: image, size, contentType } = loadRoute('../app/opengraph-image.tsx', {
    'react/jsx-runtime': jsxRuntime,
    'next/og': require('next/og'),
  });
  assert.equal(size.width, 1200);
  assert.equal(size.height, 630);
  assert.equal(contentType, 'image/png');
  const response = image();
  assert.match(response.headers.get('Content-Type'), /image\/png/);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  const sharp = require('sharp');
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 630);
  const stats = await sharp(bytes).stats();
  assert.ok(stats.channels.some((channel) => channel.stdev > 10));
});

test('root has no inherited canonical, shares origin and preview policy, and preserves build globals', () => {
  const appBuildInfo = { version: '0.3.4.test', builtAt: '2026-10-25T10:00:00Z', builtAtLabel: 'Build verificata' };
  for (const environment of ['production', 'preview']) {
    const root = loadRoute('../app/layout.tsx', {
      'react/jsx-runtime': jsxRuntime,
      'next/font/google': { Inter: () => ({ variable: '--font-inter' }) },
      './globals.css': {},
      './components/Header': { default: 'Header' },
      './components/Footer': { default: 'Footer' },
      './components/Providers': { default: 'Providers' },
      './components/PWAHandler': { default: 'PWAHandler' },
      './lib/PageTransitionContext': { PageTransitionProvider: 'PageTransitionProvider' },
      './components/LoadingIndicator': { LoadingIndicator: 'LoadingIndicator' },
      './components/PageTransition': { PageTransitionWrapper: 'PageTransitionWrapper' },
      './lib/analytics': { GoogleAnalytics: 'GoogleAnalytics' },
      './lib/gtm': { GoogleTagManager: 'GoogleTagManager' },
      '@vercel/analytics/next': { Analytics: 'Analytics' },
      '../lib/build-info': { appBuildInfo },
      '../lib/site-url': { ...site, getSiteUrl: () => origin },
      '../lib/seo-metadata': seoHelpers(environment),
    }, { URL, process: { env: {} } });
    assert.equal(root.metadata.metadataBase.origin, origin);
    assert.equal(root.metadata.alternates, undefined);
    assert.equal(root.metadata.openGraph.url, `${origin}/`);
    assert.equal(root.metadata.robots.index, environment === 'production');
    assert.equal(root.metadata.robots.googleBot.index, environment === 'production');
    const tree = root.default({ children: 'Page content' });
    const elements = [];
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      elements.push(node);
      const children = node.props?.children;
      for (const child of Array.isArray(children) ? children : [children]) walk(child);
    }
    walk(tree);
    const website = elements.find((node) => node.type === 'script');
    const json = JSON.parse(website.props.dangerouslySetInnerHTML.__html);
    assert.equal(json['@type'], 'WebSite');
    assert.equal(json.url, `${origin}/`);
    const footer = elements.find((node) => node.type === 'Footer');
    assert.equal(footer.props.version, appBuildInfo.version);
    assert.equal(footer.props.builtAt, appBuildInfo.builtAt);
    assert.equal(footer.props.builtAtLabel, appBuildInfo.builtAtLabel);
    for (const type of ['Header', 'Providers', 'GoogleAnalytics', 'GoogleTagManager', 'Analytics', 'PWAHandler']) {
      assert.ok(elements.some((node) => node.type === type), type);
    }
  }
});

test('noindex headers scope production to APIs and cover all preview responses without asset blocking', async () => {
  for (const environment of ['production', 'preview', 'development']) {
    const configFactory = loadRoute('../next.config.ts', {
      '@sentry/nextjs': { withSentryConfig: (config) => config },
      'node:child_process': { execFileSync: () => { throw new Error('No git command expected'); } },
      'next/constants': { PHASE_DEVELOPMENT_SERVER: 'dev', PHASE_PRODUCTION_BUILD: 'build' },
      './package.json': { default: { version: '0.3.4' } },
    }, { process: { env: { VERCEL_ENV: environment } }, URL }).default;
    const config = configFactory('runtime');
    const headers = await config.headers();
    const noindex = headers.filter((entry) => entry.headers.some((header) => header.key === 'X-Robots-Tag'));
    assert.equal(noindex.length, 1);
    assert.equal(noindex[0].source, environment === 'production' ? '/api/:path*' : '/:path*');
    assert.equal(noindex[0].headers[0].value, 'noindex, nofollow');
    assert.ok(headers.some((entry) => entry.source === '/manifest.json'));
    assert.ok(headers.some((entry) => entry.source === '/sw.js'));
    assert.equal(config.compress, true);
    assert.equal(config.images.formats[0], 'image/avif');
  }
});