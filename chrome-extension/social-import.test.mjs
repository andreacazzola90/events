import assert from 'node:assert/strict';
import test from 'node:test';
import { createSocialBrowserImportHandler } from '../lib/social-browser-import.mjs';
import { getCropPixels, getSupportedSocialPage, isSameCaptureTab } from './social-import-utils.mjs';

const candidate = {
  title: 'Evento di prova',
  description: 'Concerto dal vivo',
  date: '2099-06-21',
  time: '21:00',
  location: 'Teatro di prova',
  organizer: 'Organizzatore',
  category: 'other',
  price: '10 euro',
};

function request(body, headers = {}) {
  return new Request('https://backend.example/api/admin/social-browser-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function handler({ user = { userId: 7, isAdmin: true }, extract = async () => ({ events: [candidate] }) } = {}) {
  let extractionCount = 0;
  const route = createSocialBrowserImportHandler({
    authenticate: async () => user,
    extract: async (input) => {
      extractionCount += 1;
      return extract(input);
    },
  });
  return { route, getExtractionCount: () => extractionCount };
}

test('social page validation accepts only supported event and active-story paths', () => {
  assert.equal(getSupportedSocialPage('https://www.facebook.com/events/12345/'), 'facebook-event');
  assert.equal(getSupportedSocialPage('https://m.facebook.com/events/12345/?ref=share'), 'facebook-event');
  assert.equal(getSupportedSocialPage('https://www.instagram.com/stories/example/67890/'), 'instagram-story');
  assert.equal(getSupportedSocialPage('https://instagram.com/p/67890/'), null);
  assert.equal(getSupportedSocialPage('https://facebook.com/groups/123/'), null);
  assert.equal(getSupportedSocialPage('https://facebook.com.evil.example/events/12345'), null);
  assert.equal(getSupportedSocialPage('https://www.facebook.com:444/events/12345'), null);
  assert.equal(getSupportedSocialPage('https://user@www.facebook.com/events/12345'), null);
  assert.equal(getSupportedSocialPage('http://www.instagram.com/stories/example/67890/'), null);
});

test('crop geometry rejects out-of-bounds, malformed, and zero-area selections', () => {
  assert.deepEqual(
    getCropPixels(
      { x: 10, y: 12, width: 40, height: 30 },
      2,
      { width: 100, height: 100 },
      { width: 200, height: 200 },
    ),
    { sx: 20, sy: 24, sw: 80, sh: 60 },
  );
  assert.equal(getCropPixels(
    { x: 90, y: 10, width: 20, height: 30 }, 1,
    { width: 100, height: 100 }, { width: 100, height: 100 },
  ), null);
  assert.equal(getCropPixels(
    { x: 0, y: 0, width: 7, height: 30 }, 1,
    { width: 100, height: 100 }, { width: 100, height: 100 },
  ), null);
  assert.equal(getCropPixels(
    { x: 0, y: 0, width: 95, height: 95 }, 1,
    { width: 100, height: 100 }, { width: 100, height: 100 },
    { maxAreaRatio: 0.85 },
  ), null);
  assert.equal(getCropPixels(
    { x: Number.NaN, y: 0, width: 20, height: 20 }, 1,
    { width: 100, height: 100 }, { width: 100, height: 100 },
  ), null);
});

test('capture safety rejects a switched or navigated tab', () => {
  const original = { id: 8, windowId: 2, url: 'https://instagram.com/stories/example/123/', active: true };
  assert.equal(isSameCaptureTab(original, { ...original }), true);
  assert.equal(isSameCaptureTab(original, { ...original, id: 9 }), false);
  assert.equal(isSameCaptureTab(original, { ...original, url: 'https://instagram.com/' }), false);
  assert.equal(isSameCaptureTab(original, { ...original, active: false }), false);
});

test('authorized text preview returns only vetted draft fields and never stores or publishes', async () => {
  let receivedText;
  const { route } = handler({
    extract: async (input) => {
      receivedText = input.text;
      return {
        events: [{ ...candidate, imageUrl: 'data:image/png;base64,private', rawText: 'private source' }],
        discarded: 2,
        source: 'private source',
      };
    },
  });

  const response = await route(request({ text: 'Selected public event details', consent: true }));
  assert.equal(response.status, 200);
  assert.equal(receivedText, 'Selected public event details');
  assert.deepEqual(await response.json(), {
    events: [{
      title: candidate.title,
      description: candidate.description,
      date: candidate.date,
      time: candidate.time,
      location: candidate.location,
      organizer: candidate.organizer,
      category: candidate.category,
      price: candidate.price,
    }],
  });
});

test('authorized image preview accepts only a bounded PNG data URL', async () => {
  let receivedImage;
  const { route } = handler({
    extract: async (input) => {
      receivedImage = input.image;
      return { events: [] };
    },
  });
  const png = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
  png.write('IHDR', 12, 'ascii');
  png.writeUInt32BE(1, 16);
  png.writeUInt32BE(1, 20);
  const response = await route(request({ image: `data:image/png;base64,${png.toString('base64')}`, consent: true }));

  assert.equal(response.status, 200);
  assert.deepEqual([...receivedImage], [...png]);
  assert.deepEqual(await response.json(), { events: [] });
});

test('image preview rejects excessive dimensions and empty extraction creates no draft', async () => {
  const { route } = handler({ extract: async () => ({ events: [] }) });
  const oversized = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(oversized);
  oversized.write('IHDR', 12, 'ascii');
  oversized.writeUInt32BE(5000, 16);
  oversized.writeUInt32BE(3000, 20);
  const invalidImage = await route(request({ image: `data:image/png;base64,${oversized.toString('base64')}`, consent: true }));
  assert.equal(invalidImage.status, 400);

  const noEvents = await route(request({ text: 'Selected content with no event', consent: true }));
  assert.equal(noEvents.status, 200);
  assert.deepEqual(await noEvents.json(), { events: [] });
});

test('unauthenticated and non-admin callers never reach extraction', async () => {
  const unauthenticated = handler({ user: null });
  assert.equal((await unauthenticated.route(request({ text: 'event' }))).status, 401);
  assert.equal(unauthenticated.getExtractionCount(), 0);

  const ordinaryUser = handler({ user: { userId: 3, isAdmin: false } });
  assert.equal((await ordinaryUser.route(request({ text: 'event' }))).status, 403);
  assert.equal(ordinaryUser.getExtractionCount(), 0);
});

test('input rejects raw source metadata, mixed payloads, and unsupported image bytes', async () => {
  const { route, getExtractionCount } = handler();
  assert.equal((await route(request({ text: 'event details', sourceUrl: 'https://private.example', consent: true }))).status, 400);
  assert.equal((await route(request({ text: 'event details', image: 'data:image/png;base64,AA==', consent: true }))).status, 400);
  assert.equal((await route(request({ image: 'data:image/png;base64,AA==', consent: true }))).status, 400);
  assert.equal(getExtractionCount(), 0);
});

test('preview requires an affirmative consent value', async () => {
  const { route, getExtractionCount } = handler();
  assert.equal((await route(request({ text: 'Selected event text' }))).status, 400);
  assert.equal((await route(request({ text: 'Selected event text', consent: false }))).status, 400);
  assert.equal(getExtractionCount(), 0);
});

test('oversized request bodies are rejected before extraction', async () => {
  const { route, getExtractionCount } = handler();
  const body = JSON.stringify({ text: 'a'.repeat(2_200_000), consent: true });
  const response = await route(new Request('https://backend.example/api/admin/social-browser-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }));
  assert.equal(response.status, 413);
  assert.equal(getExtractionCount(), 0);
});

test('extraction failures return a generic error without exposing source text', async () => {
  const { route } = handler({
    extract: async () => { throw new Error('private source should not be logged or returned'); },
  });
  const response = await route(request({ text: 'private source', consent: true }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'social_import_unavailable' });
});
