import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');

function createFetchHandler({ fetchResponse, cachedResponse, offline = false }) {
  const handlers = {};
  const cache = { put: async () => {} };
  const caches = {
    open: async () => cache,
    match: async () => cachedResponse,
  };
  const self = {
    location: new URL('https://example.test/'),
    addEventListener: (type, handler) => { handlers[type] = handler; },
  };

  vm.runInNewContext(source, {
    self,
    caches,
    URL,
    fetch: async () => {
      if (offline) throw new Error('offline');
      return fetchResponse;
    },
    console,
  });

  return (path) => {
    let response;
    handlers.fetch({
      request: { url: new URL(path, self.location).href, mode: 'navigate', method: 'GET' },
      respondWith: (promise) => { response = promise; },
    });
    return response;
  };
}

test('service worker returns the network response for a page navigation', async () => {
  const network = new Response('fresh page');
  const handleFetch = createFetchHandler({ fetchResponse: network });

  assert.equal(await handleFetch('/'), network);
});

test('service worker falls back to the cached page when offline', async () => {
  const cached = new Response('cached page');
  const handleFetch = createFetchHandler({ cachedResponse: cached, offline: true });

  assert.equal(await handleFetch('/'), cached);
});
