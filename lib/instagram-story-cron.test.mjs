import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const routePath = '../app/api/cron/generate-instagram-story/route.ts';
const settingsPath = './instagram-story-settings.ts';
const require = createRequire(import.meta.url);
const sharp = require('sharp');

function compile(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
}

function loadSettingsModule(env) {
  const context = { exports: {}, Buffer, process: { env }, require };
  vm.runInNewContext(compile(settingsPath), context);
  return context.exports;
}

function loadStoryRoute(env, events = [], { settings = null, fetchImpl, settingsAvailable = true } = {}) {
  const uploads = [];
  const fetchCalls = [];
  let renderedMarkup = '';
  const state = { settings };
  const settingsModule = loadSettingsModule(env);

  const settingsDelegate = {
    findUnique: async () => {
      if (!settingsAvailable) throw new Error('relation "InstagramStorySettings" does not exist');
      return state.settings;
    },
    upsert: async ({ create }) => {
      state.settings ??= { ...settingsModule.DEFAULT_INSTAGRAM_STORY_SCHEDULE, lastRunSlot: null, ...create };
      return state.settings;
    },
    updateMany: async ({ where, data }) => {
      const current = state.settings?.lastRunSlot ?? null;
      const slot = where.OR[1].lastRunSlot.not;
      if (!state.settings || current === slot) return { count: 0 };
      Object.assign(state.settings, data);
      return { count: 1 };
    },
    update: async ({ data }) => Object.assign(state.settings, data),
  };

  const context = {
    exports: {},
    Buffer,
    URLSearchParams,
    AbortSignal,
    Intl,
    setTimeout,
    console: { ...console, warn: () => {} },
    fetch: async (url, init) => {
      fetchCalls.push({ url: String(url), init });
      if (!fetchImpl) throw new Error(`Unexpected fetch: ${url}`);
      return fetchImpl(String(url), init);
    },
    process: { env },
    require(name) {
      if (name === 'next/server') {
        return { NextResponse: { json: (data, options) => ({ data, status: options?.status ?? 200 }) } };
      }
      if (name === 'sharp') return sharp;
      if (name === 'react') return require('react');
      if (name === 'next/og') {
        const { ImageResponse } = require('next/og');
        return {
          ImageResponse: class extends ImageResponse {
            constructor(element, options) {
              renderedMarkup = JSON.stringify(element);
              super(element, options);
            }
          },
        };
      }
      if (name === '../../../../lib/instagram-story-settings') return settingsModule;
      if (name === '@/lib/prisma') {
        return { prisma: { event: { findMany: async () => events }, instagramStorySettings: settingsDelegate } };
      }
      if (name === '@/lib/supabase') {
        return {
          getSupabaseClient: () => ({
            storage: {
              from: () => ({
                upload: async (path, body, options) => {
                  uploads.push({ path, body: Buffer.from(body), options });
                  return { error: null };
                },
                getPublicUrl: path => ({ data: { publicUrl: `https://storage.test/${path}` } }),
              }),
            },
          }),
        };
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(compile(routePath), context);
  const route = context.exports;
  route.uploads = uploads;
  route.fetchCalls = fetchCalls;
  route.state = state;
  route.settingsModule = settingsModule;
  Object.defineProperty(route, 'renderedMarkup', { get: () => renderedMarkup });
  return route;
}

function cronRequest(authorization, query = '') {
  return {
    headers: { get: () => authorization },
    nextUrl: new URL(`https://example.test/api/cron/generate-instagram-story${query}`),
  };
}

function nextThursdayIso(offsetDays = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + ((4 - date.getDay() + 7) % 7) + offsetDays);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

const AUTH = 'Bearer vercel-secret';
const ENV = { CRON_SECRET: 'vercel-secret', NEXTAUTH_SECRET_KEY: 'test-secret' };
const EVERY_DAY = { publishDays: [0, 1, 2, 3, 4, 5, 6] };

test('Vercel runs a single daily cron (Hobby plan) that includes the story job', () => {
  assert.deepEqual(config.crons, [{ path: '/api/cron/daily', schedule: '0 18 * * *' }]);
  const dispatcher = readFileSync(new URL('../app/api/cron/daily/route.ts', import.meta.url), 'utf8');
  assert.ok(dispatcher.includes('/api/cron/generate-instagram-story'));
});

test('the story endpoint accepts Vercel CRON_SECRET and fails closed without a secret', async () => {
  const missingSecret = await loadStoryRoute({}).GET(cronRequest(null, '?force=1'));
  assert.equal(missingSecret.status, 503);

  const unauthorized = await loadStoryRoute(ENV).GET(cronRequest('Bearer wrong', '?force=1'));
  assert.equal(unauthorized.status, 401);

  const generated = await loadStoryRoute(ENV).GET(cronRequest(AUTH, '?force=1'));
  assert.equal(generated.status, 200);
  assert.equal(generated.data.status, 'success');

  const legacyGenerated = await loadStoryRoute({ CRON_SECRET_KEY: 'legacy-secret' })
    .GET(cronRequest('Bearer legacy-secret', '?force=1'));
  assert.equal(legacyGenerated.status, 200);
});

test('the story cron renders and uploads a JPEG containing events in its weekly window', async () => {
  const eventTitle = 'Concerto di prova';
  const story = loadStoryRoute(ENV, [{
    id: 1,
    title: eventTitle,
    date: nextThursdayIso(),
    time: '20:30',
    location: 'Schio',
    imageUrl: null,
  }]);

  const response = await story.GET(cronRequest(AUTH, '?force=1'));

  assert.equal(response.status, 200);
  assert.equal(response.data.totalEvents, 1);
  assert.ok(story.renderedMarkup.includes(eventTitle));
  assert.deepEqual(story.uploads.map(({ path }) => path), [
    'stories/weekly-events-latest.jpg',
    `stories/archive/weekly-events-${response.data.range.from}_to_${response.data.range.to}.jpg`,
  ]);
  assert.ok(story.uploads[0].body.subarray(0, 2).equals(Buffer.from([0xff, 0xd8])));
  assert.equal(story.uploads[0].options.contentType, 'image/jpeg');

  const metadata = await sharp(story.uploads[0].body).metadata();
  assert.equal(metadata.width, 1080);
  assert.equal(metadata.height, 1920);
});

test('the story embeds a thumbnail of the event image', async () => {
  const poster = await sharp({
    create: { width: 300, height: 400, channels: 3, background: '#d65a38' },
  }).png().toBuffer();
  const story = loadStoryRoute(ENV, [{
    id: 7,
    title: 'Mostra con locandina',
    date: nextThursdayIso(1),
    time: '18:00',
    location: 'Thiene',
    imageUrl: 'https://images.test/poster.png',
  }], {
    fetchImpl: async () => new Response(poster, { headers: { 'content-type': 'image/png' } }),
  });

  const response = await story.GET(cronRequest(AUTH, '?force=1'));

  assert.equal(response.status, 200);
  assert.deepEqual(story.fetchCalls.map(({ url }) => url), ['https://images.test/poster.png']);
  assert.ok(story.renderedMarkup.includes('data:image/jpeg;base64,'));
});

test('the story keeps rendering when a thumbnail cannot be downloaded', async () => {
  const story = loadStoryRoute(ENV, [{
    id: 8,
    title: 'Evento senza immagine raggiungibile',
    date: nextThursdayIso(),
    time: '',
    location: 'Schio',
    imageUrl: 'https://images.test/missing.jpg',
  }], {
    fetchImpl: async () => new Response('not found', { status: 404 }),
  });

  const response = await story.GET(cronRequest(AUTH, '?force=1'));

  assert.equal(response.status, 200);
  assert.ok(!story.renderedMarkup.includes('data:image/jpeg;base64,'));
  assert.ok(story.renderedMarkup.includes('Evento senza immagine raggiungibile'));
});

test('events that do not fit are summarized instead of overflowing the story', async () => {
  const events = Array.from({ length: 30 }, (_, index) => ({
    id: index + 1,
    title: `Evento ${index + 1}`,
    date: nextThursdayIso(index % 7),
    time: '21:00',
    location: 'Schio',
    imageUrl: null,
  }));
  const story = loadStoryRoute(ENV, events);

  const response = await story.GET(cronRequest(AUTH, '?force=1'));

  assert.equal(response.status, 200);
  assert.equal(response.data.totalEvents, 30);
  const match = story.renderedMarkup.match(/\+ altri (\d+) eventi sul sito/);
  assert.ok(match, 'overflow summary must be rendered');
  assert.ok(Number(match[1]) > 0 && Number(match[1]) < 30);
});

test('scheduled calls are skipped outside the configured days', async () => {
  const story = loadStoryRoute(ENV, [], {
    settings: { autoPublish: false, publishDays: [], lastRunSlot: null },
  });

  const response = await story.GET(cronRequest(AUTH));

  assert.equal(response.status, 200);
  assert.equal(response.data.status, 'skipped');
  assert.equal(story.uploads.length, 0);
});

test('a due scheduled slot runs once even if the cron fires again', async () => {
  const story = loadStoryRoute(ENV, [], {
    settings: { autoPublish: false, ...EVERY_DAY, lastRunSlot: null },
  });

  const first = await story.GET(cronRequest(AUTH));
  const second = await story.GET(cronRequest(AUTH));

  assert.equal(first.data.status, 'success');
  assert.equal(first.data.trigger, 'schedule');
  assert.equal(first.data.instagramStory.published, false);
  assert.equal(second.data.status, 'skipped');
  assert.equal(story.uploads.length, 2);
  assert.match(story.state.settings.lastRunSlot, /^\d{4}-\d{2}-\d{2}$/);
});

test('auto publish posts the archived image to Instagram with the stored encrypted token', async () => {
  const settingsModule = loadSettingsModule(ENV);
  const token = 'EAAG-test-long-lived-token-123456';
  const graphCalls = [];
  const story = loadStoryRoute(ENV, [], {
    settings: {
      autoPublish: true,
      ...EVERY_DAY,
      lastRunSlot: null,
      igUserId: '17841400000000000',
      accessTokenEncrypted: settingsModule.encryptInstagramToken(token),
      graphApiVersion: 'v22.0',
    },
    fetchImpl: async (url, init) => {
      graphCalls.push({ url, body: init?.body ? String(init.body) : '' });
      if (url.endsWith('/17841400000000000/media')) return Response.json({ id: 'container-1' });
      if (url.includes('/container-1?')) return Response.json({ status_code: 'FINISHED' });
      if (url.endsWith('/media_publish')) return Response.json({ id: 'media-1' });
      return Response.json({ error: { message: 'unexpected' } }, { status: 400 });
    },
  });

  const response = await story.GET(cronRequest(AUTH));

  assert.equal(response.status, 200);
  assert.equal(response.data.instagramStory.published, true);
  assert.equal(response.data.instagramStory.mediaId, 'media-1');
  const createBody = new URLSearchParams(graphCalls[0].body);
  assert.equal(createBody.get('media_type'), 'STORIES');
  assert.equal(createBody.get('access_token'), token);
  assert.match(createBody.get('image_url'), /stories\/archive\/weekly-events-/);
  assert.equal(story.state.settings.lastMediaId, 'media-1');
  assert.equal(story.state.settings.lastError, null);
});

test('publishing without credentials fails and is reported', async () => {
  const story = loadStoryRoute(ENV, [], {
    settings: { autoPublish: false, ...EVERY_DAY, lastRunSlot: null, igUserId: null, accessTokenEncrypted: null },
  });

  const response = await story.GET(cronRequest(AUTH, '?force=1&publish=1'));

  assert.equal(response.status, 500);
  assert.match(response.data.details, /Credenziali Instagram mancanti/);
});

test('without the settings table the cron falls back to env and still generates on demand', async () => {
  const story = loadStoryRoute(ENV, [], { settingsAvailable: false });

  const response = await story.GET(cronRequest(AUTH, '?force=1'));

  assert.equal(response.status, 200);
  assert.equal(response.data.instagramStory.published, false);
});
