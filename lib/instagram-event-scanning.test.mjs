import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { DateTime } from 'luxon';
import * as connectionApi from './instagram-scan-connection.ts';

const KEY = 'cd'.repeat(32);
const TOKEN = 'EAAGlongLivedSecretToken1234567890';

function withEnv(values, callback) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  const restore = () => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
  try {
    const result = callback();
    if (result && typeof result.then === 'function') return result.finally(restore);
    restore();
    return result;
  } catch (error) { restore(); throw error; }
}

const configuredEnv = { INSTAGRAM_APP_ID: '1234567890', INSTAGRAM_APP_SECRET: 'app-secret-0123456789abcdef', INSTAGRAM_SCAN_ENCRYPTION_KEY: KEY, INSTAGRAM_SCAN_REDIRECT_ORIGIN: 'https://events.example', INSTAGRAM_GRAPH_API_VERSION: undefined };

function moduleWithMocks(path, mocks, appended = '') {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const context = { exports: {}, require: name => {
    if (!(name in mocks)) throw new Error(`Missing mock: ${name}`);
    return mocks[name];
  }, Date, Buffer, URL, URLSearchParams, Request, Response, Headers, AbortSignal, File, console: { ...console, error: () => {} }, process, fetch: (...args) => global.fetch(...args) };
  vm.runInNewContext(compiled + appended, context);
  return context.exports;
}

test('AES-GCM token encryption requires a 64-hex server key, randomizes and rejects tampering', () => withEnv({ INSTAGRAM_SCAN_ENCRYPTION_KEY: undefined }, () => {
  assert.throws(() => connectionApi.encryptInstagramToken(TOKEN), /instagram_key_not_configured/);
  process.env.INSTAGRAM_SCAN_ENCRYPTION_KEY = 'short';
  assert.throws(() => connectionApi.encryptInstagramToken(TOKEN), /instagram_key_not_configured/);
  process.env.INSTAGRAM_SCAN_ENCRYPTION_KEY = KEY;
  const encrypted = connectionApi.encryptInstagramToken(TOKEN);
  assert.ok(!encrypted.includes(TOKEN));
  assert.notEqual(encrypted, connectionApi.encryptInstagramToken(TOKEN));
  assert.equal(connectionApi.decryptInstagramToken(encrypted), TOKEN);
  assert.throws(() => connectionApi.decryptInstagramToken(`${encrypted.slice(0, -2)}00`), /instagram_token_unreadable/);
}));

test('OAuth URL uses the trusted origin, required scopes and an opaque state; configuration fails closed', () => withEnv(configuredEnv, () => {
  const url = new URL(connectionApi.instagramOAuthUrl('state-value-abcdefghijklmnop'));
  assert.equal(url.origin + url.pathname, 'https://www.facebook.com/v22.0/dialog/oauth');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://events.example/api/admin/instagram-scan/oauth/callback');
  assert.equal(url.searchParams.get('scope'), 'instagram_basic,pages_show_list,pages_read_engagement,business_management');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), '1234567890');
  assert.ok(!url.toString().includes(configuredEnv.INSTAGRAM_APP_SECRET));
  assert.equal(connectionApi.instagramScanConfigured(), true);
  assert.equal(connectionApi.instagramStateMatches('state-value-abcdefghijklmnop', 'state-value-abcdefghijklmnop'), true);
  assert.equal(connectionApi.instagramStateMatches('state-value-abcdefghijklmnoq', 'state-value-abcdefghijklmnop'), false);
  assert.equal(connectionApi.instagramStateMatches(null, 'state-value-abcdefghijklmnop'), false);
  assert.equal(connectionApi.instagramStateMatches('state-value-abcdefghijklmnop', undefined), false);
  process.env.INSTAGRAM_SCAN_REDIRECT_ORIGIN = 'http://evil.example';
  const nextAuth = process.env.NEXTAUTH_URL; delete process.env.NEXTAUTH_URL;
  try {
    assert.throws(() => connectionApi.instagramRedirectUri(), /instagram_origin_not_configured/);
    assert.equal(connectionApi.instagramScanConfigured(), false);
    process.env.INSTAGRAM_SCAN_REDIRECT_ORIGIN = 'https://events.example';
    delete process.env.INSTAGRAM_APP_SECRET;
    assert.throws(() => connectionApi.instagramOAuthUrl('x'), /instagram_not_configured/);
  } finally { if (nextAuth !== undefined) process.env.NEXTAUTH_URL = nextAuth; }
}));

test('same-origin mutations are required', () => withEnv(configuredEnv, () => {
  assert.throws(() => connectionApi.requireInstagramSameOrigin(new Request('https://events.example')), /same_origin_required/);
  assert.throws(() => connectionApi.requireInstagramSameOrigin(new Request('https://events.example', { headers: { origin: 'https://evil.example' } })), /same_origin_required/);
  connectionApi.requireInstagramSameOrigin(new Request('https://events.example', { headers: { origin: 'https://events.example' } }));
}));

test('Graph calls send the token only in the Authorization header and sanitize every failure', async () => {
  const original = global.fetch;
  try {
    global.fetch = async (url, options) => {
      assert.ok(!String(url).includes(TOKEN));
      assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal);
      return Response.json({ data: [{ id: '17900000000000001', media_type: 'IMAGE', media_url: 'https://scontent.cdninstagram.com/a.jpg', timestamp: '2026-10-30T10:00:00+0000' }] });
    };
    const stories = await connectionApi.fetchInstagramStories(TOKEN, '1784140000000000');
    assert.equal(stories[0].kind, 'story'); assert.equal(stories[0].caption, ''); assert.equal(stories[0].imageUrl, 'https://scontent.cdninstagram.com/a.jpg');
    global.fetch = async () => Response.json({ error: { code: 190, message: `Invalid OAuth access token ${TOKEN}` } }, { status: 400 });
    await assert.rejects(connectionApi.fetchInstagramStories(TOKEN, '1784140000000000'), error => error.code === 'instagram_token_expired' && !error.message.includes(TOKEN) && !error.cause);
    global.fetch = async () => Response.json({ error: { code: 110, message: 'Invalid user id' } }, { status: 400 });
    await assert.rejects(connectionApi.fetchInstagramBusinessPosts(TOKEN, '1784140000000000', 'private.person'), /instagram_source_not_business/);
    global.fetch = async () => Response.json({ error: { code: 4 } }, { status: 400 });
    await assert.rejects(connectionApi.fetchInstagramStories(TOKEN, '1784140000000000'), /instagram_rate_limited/);
    global.fetch = async url => { throw new Error(`failed ${url} ${TOKEN}`); };
    await assert.rejects(connectionApi.fetchInstagramStories(TOKEN, '1784140000000000'), error => error.message === 'instagram_unavailable' && !error.cause);
    let called = false;
    global.fetch = async () => { called = true; return Response.json({}); };
    await assert.rejects(connectionApi.fetchInstagramBusinessPosts(TOKEN, '1784140000000000', 'bad username)'), /invalid_username/);
    assert.equal(called, false);
  } finally { global.fetch = original; }
});

test('Business Discovery normalizes captions, carousel images and video thumbnails', async () => {
  const original = global.fetch;
  try {
    global.fetch = async url => {
      const fields = new URL(url).searchParams.get('fields');
      assert.ok(fields.startsWith('business_discovery.username(venue.official){'));
      assert.ok(fields.includes('children{media_type,media_url,thumbnail_url}'));
      return Response.json({ business_discovery: { media: { data: [
        { id: '1', caption: 'Festa', media_type: 'CAROUSEL_ALBUM', media_url: 'https://x.cdninstagram.com/v.jpg', permalink: 'https://www.instagram.com/p/AbC/', timestamp: '2026-10-29T10:00:00+0000', children: { data: [{ media_type: 'VIDEO', media_url: 'https://x.cdninstagram.com/v.mp4' }, { media_type: 'IMAGE', media_url: 'https://x.cdninstagram.com/i.jpg' }] } },
        { id: '2', caption: 'Video', media_type: 'VIDEO', media_url: 'https://x.cdninstagram.com/v.mp4', thumbnail_url: 'https://x.fbcdn.net/t.jpg', permalink: 'javascript:alert(1)', timestamp: '2026-10-29T10:00:00+0000' },
        { id: '3', caption: 'Solo video', media_type: 'CAROUSEL_ALBUM', media_url: 'https://x.cdninstagram.com/first.mp4', timestamp: '2026-10-29T10:00:00+0000', children: { data: [{ media_type: 'VIDEO', media_url: 'https://x.cdninstagram.com/c.mp4', thumbnail_url: 'https://x.fbcdn.net/c.jpg' }] } },
        { id: '4', caption: 'Album vuoto', media_type: 'CAROUSEL_ALBUM', media_url: 'https://x.cdninstagram.com/first.mp4', timestamp: '2026-10-29T10:00:00+0000', children: { data: [{ media_type: 'VIDEO', media_url: 'https://x.cdninstagram.com/d.mp4' }] } },
        { id: 'not-numeric' },
      ] } } });
    };
    const posts = await connectionApi.fetchInstagramBusinessPosts(TOKEN, '1784140000000000', 'venue.official');
    assert.equal(posts.length, 4);
    assert.equal(posts[2].imageUrl, 'https://x.fbcdn.net/c.jpg');
    assert.equal(posts[3].imageUrl, null);
    assert.equal(posts[0].imageUrl, 'https://x.cdninstagram.com/i.jpg');
    assert.equal(posts[0].permalink, 'https://www.instagram.com/p/AbC/');
    assert.equal(posts[1].imageUrl, 'https://x.fbcdn.net/t.jpg');
    assert.equal(posts[1].permalink, null);
  } finally { global.fetch = original; }
});

test('OAuth exchange yields a long-lived token and requires an Instagram professional account', async () => withEnv(configuredEnv, async () => {
  const original = global.fetch;
  const calls = [];
  try {
    global.fetch = async (url, options = {}) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/oauth/access_token')) {
        assert.equal(options.method, 'POST');
        assert.equal(parsed.search, '');
        for (const [key, value] of new URLSearchParams(options.body)) parsed.searchParams.set(key, value);
      }
      calls.push(parsed);
      if (parsed.pathname.endsWith('/oauth/access_token') && parsed.searchParams.get('code')) return Response.json({ access_token: 'short-token' });
      if (parsed.pathname.endsWith('/oauth/access_token')) return Response.json({ access_token: TOKEN, expires_in: 5_184_000 });
      return Response.json({ data: [{ id: 'page' }, { instagram_business_account: { id: '17841400000000000', username: 'my.venue' } }] });
    };
    const { token, expiresAt } = await connectionApi.exchangeInstagramCode('AQDcodevalue123456');
    assert.equal(token, TOKEN);
    assert.ok(expiresAt.getTime() > Date.now() + 59 * 86_400_000);
    assert.equal(calls[1].searchParams.get('grant_type'), 'fb_exchange_token');
    assert.equal(calls[1].searchParams.get('fb_exchange_token'), 'short-token');
    assert.deepEqual(await connectionApi.findInstagramBusinessAccount(TOKEN), { igUserId: '17841400000000000', username: 'my.venue' });
    global.fetch = async () => Response.json({ data: [{ id: 'page' }] });
    await assert.rejects(connectionApi.findInstagramBusinessAccount(TOKEN), /instagram_business_account_missing/);
    global.fetch = async () => Response.json({ error: { code: 100, message: 'code expired' } }, { status: 400 });
    await assert.rejects(connectionApi.exchangeInstagramCode('AQDcodevalue123456'), /instagram_oauth_failed/);
  } finally { global.fetch = original; }
}));

test('media downloads accept only Meta CDN HTTPS hosts, refuse redirects and are bounded to 4MB', async () => {
  for (const url of ['http://scontent.cdninstagram.com/a.jpg', 'https://evil.example/a.jpg', 'https://cdninstagram.com.evil.example/a.jpg', 'https://user:pw@x.fbcdn.net/a.jpg', 'https://x.fbcdn.net:8443/a.jpg']) {
    assert.equal(connectionApi.instagramMediaHostAllowed(url), false, url);
  }
  assert.equal(connectionApi.instagramMediaHostAllowed('https://scontent-mxp1-1.cdninstagram.com/v/a.jpg?oh=1'), true);
  const original = global.fetch;
  try {
    const loaded = moduleWithMocks('./instagram-scan-connection.ts', { 'node:crypto': await import('node:crypto'), './event-cover': { normalizeCoverImage: async bytes => Buffer.concat([Buffer.from('ok:'), bytes]) } });
    let fetched = 0;
    global.fetch = async (_url, options) => { fetched++; assert.equal(options.redirect, 'error'); return new Response('image'); };
    await assert.rejects(loaded.downloadInstagramMedia('https://evil.example/a.jpg', AbortSignal.timeout(1000)), /instagram_media_rejected/);
    assert.equal(fetched, 0);
    assert.equal((await loaded.downloadInstagramMedia('https://x.cdninstagram.com/a.jpg', AbortSignal.timeout(1000))).toString(), 'ok:image');
    global.fetch = async () => new Response(new Uint8Array(4 * 1024 * 1024 + 1));
    await assert.rejects(loaded.downloadInstagramMedia('https://x.cdninstagram.com/a.jpg', AbortSignal.timeout(1000)), /instagram_media_unavailable/);
  } finally { global.fetch = original; }
});

test('telemetry redaction removes Graph tokens, app secret, OAuth code and Authorization header', () => {
  const event = {
    breadcrumbs: [{ data: { url: `https://graph.facebook.com/v22.0/oauth/access_token?client_id=1&client_secret=app-secret&code=oauth-code&fb_exchange_token=${TOKEN}` } }],
    request: { url: 'https://events.example/api/admin/instagram-scan/oauth/callback?code=oauth-code&state=state-secret', headers: { Authorization: `Bearer ${TOKEN}` } },
    message: 'error code=keep',
  };
  const json = JSON.stringify(connectionApi.redactInstagramTelemetry(event));
  for (const secret of [TOKEN, 'app-secret', 'oauth-code', 'state-secret']) assert.ok(!json.includes(secret), secret);
  assert.ok(json.includes('error code=keep'));
  // Sentry fetch breadcrumbs store the query apart from the host-less URL.
  const breadcrumb = { data: { url: 'https://graph.facebook.com/v22.0/oauth/access_token', 'http.query': `?client_id=1&client_secret=app-secret&fb_exchange_token=${TOKEN}` } };
  const redacted = JSON.stringify(connectionApi.redactInstagramTelemetry(breadcrumb));
  for (const secret of [TOKEN, 'app-secret']) assert.ok(!redacted.includes(secret), secret);
  assert.equal(event.request.headers.Authorization, `Bearer ${TOKEN}`);
});

async function scanFixture({ sources: sourceRows, connectionOverrides = {}, duplicate = null } = {}) {
  const crypto = await import('node:crypto');
  const sharp = (await import('sharp')).default;
  const encryptedToken = withEnv({ INSTAGRAM_SCAN_ENCRYPTION_KEY: KEY }, () => connectionApi.encryptInstagramToken(TOKEN));
  const connection = { id: 'conn1', userId: 7, igUserId: '17841400000000000', username: 'my.venue', encryptedToken, tokenExpiresAt: new Date(Date.now() + 30 * 86_400_000), status: 'active', lastError: null, lastRunAt: null, ...connectionOverrides };
  const sources = sourceRows || [
    { id: 's1', connectionId: 'conn1', username: 'venue.one', isActive: true, consentedAt: new Date(), lastError: null, lastScannedAt: null },
  ];
  const items = new Map();
  const receipts = new Map();
  const events = [];
  const calendarRows = [];
  const writes = [];
  const queried = [];
  const matchSource = (source, where) => (!where.connectionId || where.connectionId === source.connectionId) &&
    (where.isActive === undefined || source.isActive === where.isActive) && (!where.consentedAt || source.consentedAt) && (!where.id || where.id === source.id);
  const db = {
    $executeRaw: async () => { writes.push('lock'); },
    instagramScanConnection: {
      findMany: async ({ where }) => connection.status === where.status && connection.encryptedToken ? [{ ...connection }] : [],
      findUnique: async ({ where }) => (where.id === connection.id || where.userId === connection.userId) ? { ...connection } : null,
      updateMany: async ({ where, data }) => {
        if (where.id !== connection.id || (where.encryptedToken && where.encryptedToken !== connection.encryptedToken)) return { count: 0 };
        writes.push('connection'); Object.assign(connection, data); return { count: 1 };
      },
      update: async ({ data }) => { writes.push('connection'); Object.assign(connection, data); return { ...connection }; },
    },
    instagramScanSource: {
      findMany: async ({ where }) => sources.filter(source => matchSource(source, where)).map(source => ({ ...source })),
      findUnique: async ({ where }) => sources.find(source => source.id === where.id || (where.connectionId_username && source.username === where.connectionId_username.username)) || null,
      findFirst: async ({ where }) => sources.find(source => matchSource(source, where)) || null,
      count: async () => sources.length,
      updateMany: async ({ where, data }) => { writes.push('source'); for (const source of sources.filter(item => matchSource(item, where))) Object.assign(source, data); return { count: 1 }; },
      update: async ({ where, data }) => { writes.push('source'); Object.assign(sources.find(item => item.id === where.id), data); },
      delete: async ({ where }) => { writes.push('source-delete'); sources.splice(sources.findIndex(item => item.id === where.id), 1); },
      deleteMany: async ({ where }) => { writes.push('source-delete'); for (let index = sources.length - 1; index >= 0; index--) if (sources[index].connectionId === where.connectionId) sources.splice(index, 1); },
      upsert: async ({ where, create, update }) => {
        writes.push('source');
        const existing = sources.find(item => item.username === where.connectionId_username.username);
        if (existing) Object.assign(existing, update); else sources.push({ id: `s${sources.length + 1}`, lastScannedAt: null, ...create });
      },
    },
    instagramScanItem: {
      findUnique: async ({ where }) => { const item = items.get(where.connectionId_mediaId.mediaId); return item ? { ...item } : null; },
      create: async ({ data }) => {
        if (items.has(data.mediaId)) throw Object.assign(new Error('unique'), { code: 'P2002' });
        writes.push('item'); const item = { id: `item-${data.mediaId}`, status: 'processing', attempts: 1, updatedAt: new Date(), ...data }; items.set(data.mediaId, item); return item;
      },
      update: async ({ where, data }) => { writes.push('item'); Object.assign([...items.values()].find(item => item.id === where.id), data); },
      updateMany: async ({ where, data }) => {
        writes.push('item');
        const item = [...items.values()].find(entry => entry.id === where.id && (!where.status || entry.status === where.status) &&
          (!where.updatedAt || entry.updatedAt?.getTime() === where.updatedAt.getTime()));
        if (item) {
          const { attempts, ...rest } = data;
          Object.assign(item, rest, { updatedAt: new Date() });
          if (attempts?.increment) item.attempts = (item.attempts || 1) + attempts.increment;
        }
        return { count: item ? 1 : 0 };
      },
    },
    instagramPublication: {
      findUnique: async ({ where }) => receipts.get(where.fingerprint) || null,
      create: async ({ data }) => { assert.ok(!receipts.has(data.fingerprint)); writes.push('receipt'); receipts.set(data.fingerprint, data); },
    },
  };
  db.$transaction = async callback => callback(db);
  const sharedMocks = {
    'node:crypto': crypto, sharp: { default: sharp, __esModule: true }, luxon: { DateTime },
    '../app/lib/google-calendar': { createEventWithCalendar: async ({ data }, tx) => {
      assert.equal(tx, db); writes.push('event+calendar'); const event = { id: events.length + 1, ...data }; events.push(event); calendarRows.push(event.id); return event;
    } },
    './event-duplicates': { findDuplicateEvent: async (_candidate, tx) => { if (tx) assert.equal(tx, db); return duplicate; }, lockEventDates: async tx => { assert.equal(tx, db); await tx.$executeRaw`lock`; } },
    './vision-ai': { createEventImageAnalyzer: () => async () => '{"events":[]}' }, './poster-crop': { createVerifiedPosterCrop: async () => null },
  };
  const shared = moduleWithMocks('./social-event-extraction.ts', sharedMocks);
  const connectionModule = moduleWithMocks('./instagram-scan-connection.ts', { 'node:crypto': crypto, './event-cover': { normalizeCoverImage: async bytes => bytes } });
  const store = moduleWithMocks('./instagram-scan-store.ts', { '../app/lib/prisma': { prisma: db }, './instagram-scan-connection': connectionModule });
  const worker = moduleWithMocks('./instagram-event-scanning.ts', {
    '../app/lib/prisma': { prisma: db }, './instagram-scan-connection': connectionModule, './instagram-scan-store': store, './social-event-extraction': shared,
  });
  const now = new Date('2026-10-30T17:00:00Z');
  const candidate = (title, date = '2099-12-20') => ({ title, date, location: 'Piazza Rossi Schio', time: '21:00', description: '', organizer: '', price: '', category: 'other' });
  const stories = [];
  const posts = new Map();
  const extractCalls = [];
  const deps = {
    fetchStories: async token => { assert.equal(token, TOKEN); queried.push('stories'); return stories.map(item => ({ ...item })); },
    fetchPosts: async (token, igUserId, username) => {
      assert.equal(token, TOKEN); assert.equal(igUserId, connection.igUserId); queried.push(username);
      const value = posts.get(username);
      if (value && !Array.isArray(value)) throw value;
      return (value || []).map(item => ({ ...item }));
    },
    downloadMedia: async url => { assert.ok(connectionApi.instagramMediaHostAllowed(url)); return Buffer.from('jpeg'); },
    extract: async ({ text, image }) => {
      extractCalls.push({ text, image: Boolean(image) });
      if (text.includes('MULTI')) return { events: [candidate('Concerto A'), candidate('Concerto B', '2099-12-21')], discarded: 1, imageUrl: 'data:image/jpeg;base64,AAAA' };
      if (text.includes('NONE')) return { events: [], discarded: 2, imageUrl: null };
      return { events: [candidate(text.trim() ? text.trim().slice(0, 40) : 'Festa della story')], discarded: 0, imageUrl: image ? 'data:image/jpeg;base64,AAAA' : null };
    },
  };
  const run = (options = {}) => withEnv({ INSTAGRAM_SCAN_ENCRYPTION_KEY: KEY }, () => worker.scanInstagram({ dryRun: false, deadline: Date.now() + 260_000, now, deps, ...options }));
  const story = (id, extra = {}) => ({ id, kind: 'story', mediaType: 'IMAGE', caption: '', imageUrl: `https://x.cdninstagram.com/${id}.jpg`, permalink: null, timestamp: new Date(now.getTime() - 3_600_000), ...extra });
  const post = (id, caption, ageDays = 1, extra = {}) => ({ id, kind: 'post', mediaType: 'IMAGE', caption, imageUrl: `https://x.cdninstagram.com/${id}.jpg`, permalink: `https://www.instagram.com/p/${id}/`, timestamp: new Date(now.getTime() - ageDays * 86_400_000), ...extra });
  return { ScanError: connectionModule.InstagramScanError, db, worker, store, connection, sources, items, receipts, events, calendarRows, writes, queried, stories, posts, extractCalls, run, story, post, deps };
}

test('no active connection skips the job without writes', async () => {
  const state = await scanFixture({ connectionOverrides: { status: 'disconnected', encryptedToken: null } });
  const result = await state.run();
  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'not_connected');
  assert.deepEqual(state.writes, []);
});

test('own IMAGE story is analyzed once, published with profile link and never reprocessed', async () => {
  const state = await scanFixture({ sources: [] });
  state.stories.push(state.story('1001'));
  const first = await state.run();
  assert.equal(first.status, 'success');
  assert.equal(first.published, 1);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].sourceUrl, 'https://www.instagram.com/my.venue/');
  assert.equal(state.events[0].origin, 'instagram');
  assert.equal(state.events[0].imageUrl, 'data:image/jpeg;base64,AAAA');
  assert.match(state.events[0].externalId, /^instagram:1001:[a-f0-9]{16}$/);
  assert.equal(state.items.get('1001').status, 'published');
  assert.equal(state.receipts.size, 1);
  assert.equal(state.connection.lastPublished, 1);
  assert.ok(state.connection.lastRunAt instanceof Date);
  const second = await state.run();
  assert.equal(second.published, 0);
  assert.equal(second.skipped, 1);
  assert.equal(state.extractCalls.length, 1);
  assert.equal(state.events.length, 1);
});

test('VIDEO story without thumbnail is discarded with a count and no AI call', async () => {
  const state = await scanFixture({ sources: [] });
  state.stories.push(state.story('2001', { mediaType: 'VIDEO', imageUrl: null }));
  const result = await state.run();
  assert.equal(result.discarded, 1);
  assert.equal(result.visited, 1);
  assert.equal(state.extractCalls.length, 0);
  assert.equal(state.items.get('2001').status, 'discarded');
  assert.equal(state.events.length, 0);
});

test('Business Discovery posts from the last 7 days are published with permalink; a failing source does not stop the others', async () => {
  const state = await scanFixture({ sources: [
    { id: 's1', connectionId: 'conn1', username: 'private.person', isActive: true, consentedAt: new Date(), lastError: null, lastScannedAt: null },
    { id: 's2', connectionId: 'conn1', username: 'venue.one', isActive: true, consentedAt: new Date(), lastError: null, lastScannedAt: null },
  ] });
  state.posts.set('private.person', new state.ScanError('instagram_source_not_business', 404));
  state.posts.set('venue.one', [state.post('3001', 'Sagra del paese'), state.post('3002', 'Vecchio evento', 9)]);
  const result = await state.run();
  assert.equal(result.status, 'partial-error');
  assert.equal(result.sourceErrors, 1);
  assert.equal(result.published, 1);
  assert.equal(state.events[0].sourceUrl, 'https://www.instagram.com/p/3001/');
  assert.ok(!state.items.has('3002'), 'posts older than 7 days are ignored');
  assert.equal(state.sources[0].lastError, 'instagram_source_not_business');
  assert.equal(state.sources[1].lastError, null);
  assert.equal(state.connection.lastError, 'instagram_source_errors');
});

test('paused or unconsented sources are never queried', async () => {
  const state = await scanFixture({ sources: [
    { id: 's1', connectionId: 'conn1', username: 'paused.venue', isActive: false, consentedAt: new Date(), lastError: null, lastScannedAt: null },
    { id: 's2', connectionId: 'conn1', username: 'no.consent', isActive: true, consentedAt: null, lastError: null, lastScannedAt: null },
  ] });
  await state.run();
  assert.deepEqual(state.queried, ['stories']);
});

test('existing receipts and duplicate events create no new event', async () => {
  const state = await scanFixture({ sources: [], duplicate: { id: 99 } });
  state.stories.push(state.story('4001'));
  const result = await state.run();
  assert.equal(result.duplicates, 1);
  assert.equal(result.published, 0);
  assert.equal(state.events.length, 0);
  assert.equal([...state.receipts.values()][0].eventId, 99);
  assert.equal(state.items.get('4001').status, 'published');
  state.stories.splice(0, 1, state.story('4002'));
  const again = await state.run();
  assert.equal(again.duplicates, 1);
  assert.equal(state.events.length, 0);
});

test('multi-event media omits the cover image', async () => {
  const state = await scanFixture({ sources: [] });
  state.stories.push(state.story('5001', { caption: '' }));
  state.deps.extract = async () => ({ events: [
    { title: 'Concerto A', date: '2099-12-20', location: 'Piazza Rossi Schio', time: '', description: '', organizer: '', price: '', category: 'other' },
    { title: 'Concerto B', date: '2099-12-21', location: 'Piazza Rossi Schio', time: '', description: '', organizer: '', price: '', category: 'other' },
  ], discarded: 0, imageUrl: 'data:image/jpeg;base64,AAAA' });
  const result = await state.run();
  assert.equal(result.published, 2);
  assert.ok(state.events.every(event => event.imageUrl === null));
});

test('Graph error 190 marks the connection expired and stops the job without retry loops', async () => {
  const state = await scanFixture({ sources: [
    { id: 's1', connectionId: 'conn1', username: 'venue.one', isActive: true, consentedAt: new Date(), lastError: null, lastScannedAt: null },
    { id: 's2', connectionId: 'conn1', username: 'venue.two', isActive: true, consentedAt: new Date(), lastError: null, lastScannedAt: null },
  ] });
  state.posts.set('venue.one', new state.ScanError('instagram_token_expired', 401));
  const result = await state.run();
  assert.equal(result.status, 'partial-error');
  assert.equal(result.expired, 1);
  assert.deepEqual(state.queried, ['stories', 'venue.one']);
  assert.equal(state.connection.status, 'expired');
  assert.equal(state.connection.encryptedToken, null);
  assert.equal(state.connection.lastError, 'instagram_token_expired');
  const next = await state.run();
  assert.equal(next.status, 'skipped');
});

test('a stored expiry in the past expires the connection before any Graph call', async () => {
  const state = await scanFixture({ connectionOverrides: { tokenExpiresAt: new Date('2026-10-01T00:00:00Z') } });
  const result = await state.run();
  assert.equal(result.expired, 1);
  assert.deepEqual(state.queried, []);
  assert.equal(state.connection.status, 'expired');
});

test('dry-run counts wouldPublish without writing items, events, receipts, calendar or connection', async () => {
  const state = await scanFixture();
  state.stories.push(state.story('6001'));
  state.posts.set('venue.one', [state.post('6002', 'Mercatino')]);
  const result = await state.run({ dryRun: true });
  assert.equal(result.status, 'dry-run');
  assert.equal(result.wouldPublish, 2);
  assert.equal(result.published, 0);
  assert.deepEqual(state.writes, []);
  assert.equal(state.items.size + state.events.length + state.receipts.size + state.calendarRows.length, 0);
  assert.equal(state.connection.lastRunAt, null);
});

test('dry-run also reports expiry without mutating the connection', async () => {
  const state = await scanFixture({ sources: [] });
  state.deps.fetchStories = async () => { throw new state.ScanError('instagram_token_expired', 401); };
  const result = await state.run({ dryRun: true });
  assert.equal(result.expired, 1);
  assert.equal(state.connection.status, 'active');
  assert.deepEqual(state.writes, []);
});

test('at most 12 media are analyzed per run; the rest is deferred', async () => {
  const state = await scanFixture();
  for (let index = 0; index < 8; index++) state.stories.push(state.story(String(7000 + index)));
  state.posts.set('venue.one', Array.from({ length: 8 }, (_, index) => state.post(String(7100 + index), `Evento numero ${index}`)));
  const result = await state.run();
  assert.equal(result.visited, 12);
  assert.equal(state.extractCalls.length, 12);
  assert.equal(result.status, 'partial');
  assert.ok(result.deferred >= 4);
});

test('transient extraction failure is retried up to three attempts, then closed as failed', async () => {
  const state = await scanFixture({ sources: [] });
  state.stories.push(state.story('8001'));
  let calls = 0;
  state.deps.extract = async () => { calls++; throw new Error(`provider leaked ${TOKEN}`); };
  const result = await state.run();
  assert.equal(result.failed, 1);
  assert.equal(state.items.get('8001').status, 'retry');
  assert.equal(state.items.get('8001').lastError, 'instagram_processing_unavailable');
  assert.ok(!JSON.stringify(state.connection).includes(TOKEN));
  await state.run();
  await state.run();
  assert.equal(state.items.get('8001').status, 'failed');
  assert.equal(state.items.get('8001').attempts, 3);
  await state.run();
  assert.equal(calls, 3);
});

test('invalid extraction is terminal and never retried', async () => {
  const state = await scanFixture({ sources: [] });
  state.stories.push(state.story('8002'));
  let calls = 0;
  state.deps.extract = async ({ fail }) => { calls++; throw fail(); };
  await state.run();
  assert.equal(state.items.get('8002').status, 'failed');
  await state.run();
  assert.equal(calls, 1);
});

test('a media stuck in processing by a crashed run is reclaimed once stale', async () => {
  const state = await scanFixture({ sources: [] });
  state.stories.push(state.story('8003'));
  state.items.set('8003', { id: 'item-8003', connectionId: state.connection.id, mediaId: '8003', status: 'processing', attempts: 1, updatedAt: new Date(Date.now() - 60_000) });
  await state.run({ now: new Date() });
  assert.equal(state.extractCalls.length, 0);
  state.items.get('8003').updatedAt = new Date(Date.now() - 3_600_000);
  await state.run({ now: new Date() });
  assert.equal(state.extractCalls.length, 1);
  assert.equal(state.items.get('8003').attempts, 2);
});

test('media are deferred unless the full extraction and commit budget remains', async () => {
  const state = await scanFixture({ sources: [] });
  state.stories.push(state.story('8004'));
  const result = await state.run({ deadline: Date.now() + 70_000 });
  assert.equal(result.deferred, 1);
  assert.equal(state.extractCalls.length, 0);
  assert.equal(state.items.has('8004'), false);
});

test('admin store: consent required, owner-scoped sources, disconnect deletes token and sources but keeps receipts', async () => {
  const state = await scanFixture();
  const post = body => new Request('https://events.example/api/admin/instagram-scan', { method: 'POST', headers: { origin: 'https://events.example', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  await withEnv(configuredEnv, async () => {
    await assert.rejects(state.store.mutateInstagramScanAdmin(post({ action: 'save-source', username: 'new.venue', consent: false }), 7), /username_and_consent_required/);
    await assert.rejects(state.store.mutateInstagramScanAdmin(post({ action: 'save-source', username: 'bad name!', consent: true }), 7), /username_and_consent_required/);
    await assert.rejects(state.store.mutateInstagramScanAdmin(new Request('https://events.example', { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' }), 7), /same_origin_required/);
    const status = await state.store.getInstagramScanAdminStatus(7);
    assert.ok(!JSON.stringify(status).includes(state.connection.encryptedToken));
    assert.equal(status.username, 'my.venue');
    assert.equal(status.connected, true);
    state.receipts.set('fingerprint', { fingerprint: 'fingerprint', eventId: 1 });
    assert.equal((await state.store.mutateInstagramScanAdmin(post({ action: 'disconnect' }), 7)).connected, false);
    assert.equal(state.connection.status, 'disconnected');
    assert.equal(state.connection.encryptedToken, null);
    assert.equal(state.sources.length, 0);
    assert.equal(state.receipts.size, 1);
    assert.equal((await state.worker.scanInstagram({ dryRun: false, deadline: Date.now() + 10_000, deps: state.deps })).status, 'skipped');
  });
});

test('admin store verifies a new source through Business Discovery before saving it with consent', async () => {
  const state = await scanFixture({ sources: [] });
  const original = global.fetch;
  const post = body => new Request('https://events.example/api/admin/instagram-scan', { method: 'POST', headers: { origin: 'https://events.example' }, body: JSON.stringify(body) });
  try {
    await withEnv(configuredEnv, async () => {
      global.fetch = async () => Response.json({ error: { code: 110 } }, { status: 400 });
      await assert.rejects(state.store.mutateInstagramScanAdmin(post({ action: 'save-source', username: 'private.person', consent: true }), 7), /instagram_source_not_business/);
      assert.equal(state.sources.length, 0);
      global.fetch = async () => Response.json({ business_discovery: { media: { data: [] } } });
      await state.store.mutateInstagramScanAdmin(post({ action: 'save-source', username: '@Venue.One', consent: true }), 7);
      assert.equal(state.sources[0].username, 'venue.one');
      assert.ok(state.sources[0].consentedAt instanceof Date);
      await state.store.mutateInstagramScanAdmin(post({ action: 'pause-source', sourceId: state.sources[0].id }), 7);
      assert.equal(state.sources[0].isActive, false);
      assert.equal(state.sources[0].consentedAt, null);
      global.fetch = async () => Response.json({ error: { code: 190 } }, { status: 400 });
      await assert.rejects(state.store.mutateInstagramScanAdmin(post({ action: 'save-source', username: 'venue.two', consent: true }), 7), /instagram_token_expired/);
      assert.equal(state.connection.status, 'expired');
    });
  } finally { global.fetch = original; }
});

function routeMocks(session, role, store) {
  const json = (data, options) => ({ data, status: options?.status ?? 200 });
  return {
    'next/server': { NextResponse: { json } },
    '../../../lib/auth-helpers': { withAuth: async handler => session ? handler(session) : json({ error: 'Non autorizzato' }, { status: 401 }) },
    '../../../lib/prisma': { prisma: { user: { findUnique: async () => ({ role, type: 'user' }) } } },
    '../../../../lib/instagram-scan-store': store,
    '../../../../lib/instagram-scan-connection': connectionApi,
  };
}

test('instagram-scan admin API rejects anonymous and non-admin users without data', async () => {
  let reads = 0;
  const store = { getInstagramScanAdminStatus: async () => { reads++; return { secret: 'never' }; }, mutateInstagramScanAdmin: async () => { reads++; return {}; } };
  const anonymous = moduleWithMocks('../app/api/admin/instagram-scan/route.ts', routeMocks(null, 'admin', store));
  assert.equal((await anonymous.GET()).status, 401);
  const user = moduleWithMocks('../app/api/admin/instagram-scan/route.ts', routeMocks(7, 'user', store));
  const denied = await user.GET();
  assert.equal(denied.status, 403);
  assert.ok(!JSON.stringify(denied.data).includes('never'));
  assert.equal((await user.POST(new Request('https://events.example', { method: 'POST' }))).status, 403);
  assert.equal(reads, 0);
  const admin = moduleWithMocks('../app/api/admin/instagram-scan/route.ts', routeMocks(7, 'admin', store));
  assert.equal((await admin.GET()).status, 200);
});

test('scan-instagram cron route fails closed, checks bearer secrets and forwards dry-run with a 260s budget', async () => {
  const calls = [];
  const load = env => {
    const routeModule = moduleWithMocks('../app/api/cron/scan-instagram/route.ts', {
      'node:crypto': require('node:crypto'),
      'next/server': { NextResponse: { json: (data, options) => ({ data, status: options?.status ?? 200 }) } },
      '../../../../lib/instagram-event-scanning': { scanInstagram: async options => { calls.push(options); return { status: options.dryRun ? 'dry-run' : 'success' }; } },
      '../../../../lib/instagram-scan-connection': connectionApi,
    });
    return { module: routeModule, env };
  };
  const request = (authorization, query = '') => ({ headers: new Headers(authorization ? { authorization } : {}), nextUrl: new URL(`https://events.example/api/cron/scan-instagram${query}`) });
  await withEnv({ CRON_SECRET: undefined, CRON_SECRET_KEY: undefined }, async () => {
    assert.equal((await load().module.GET(request('Bearer x'))).status, 503);
  });
  await withEnv({ CRON_SECRET: 'cron-secret', CRON_SECRET_KEY: undefined }, async () => {
    const { module } = load();
    assert.equal((await module.GET(request('Bearer wrong'))).status, 401);
    assert.equal(calls.length, 0);
    const started = Date.now();
    const response = await module.GET(request('Bearer cron-secret', '?dryRun=1'));
    assert.equal(response.status, 200);
    assert.equal(response.data.status, 'dry-run');
    assert.equal(calls[0].dryRun, true);
    assert.ok(calls[0].deadline - started <= 260_000 + 50 && calls[0].deadline - started >= 259_000);
  });
});

const require = (await import('node:module')).createRequire(import.meta.url);
