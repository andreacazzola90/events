import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { coverUrl, fetchCoverResource, isPublicCoverAddress } from './event-cover-network.ts';

test('rejects private, reserved, mapped-hex, transition and non-global IP addresses', () => {
  for (const address of [
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1',
    '192.168.1.1', '192.0.2.1', '198.18.0.1', '224.0.0.1', '255.255.255.255',
    '::', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a00:1', 'fc00::1',
    'fe80::1', 'ff02::1', '64:ff9b::a00:1', '2001::1', '2001:db8::1', '2002:7f00:1::', '3fff::1',
  ]) assert.equal(isPublicCoverAddress(address), false, address);
  for (const address of ['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111', '2001:4860:4860::8888']) {
    assert.equal(isPublicCoverAddress(address), true, address);
  }
});

test('normalizes URLs and rejects non-HTTP, credentials, local hosts and unusual ports', () => {
  for (const url of [
    'file:///etc/passwd', 'ftp://example.com/image.jpg', 'https://user:pass@example.com',
    'http://localhost.', 'http://service.local', 'http://0x7f000001', 'http://2130706433',
    'http://[::ffff:7f00:1]', 'https://example.com:8443/image.jpg',
  ]) assert.throws(() => coverUrl(url), undefined, url);
  assert.equal(coverUrl('https://example.com/a#secret').href, 'https://example.com/a');
});

function mockNetwork(responses, addresses = [{ address: '93.184.216.34', family: 4 }]) {
  const calls = [];
  const resolveCalls = [];
  const http = (url, options, callback) => {
    const request = new EventEmitter();
    request.setTimeout = () => {};
    request.destroy = error => request.emit('error', error);
    request.end = () => queueMicrotask(() => {
      const reply = responses.shift();
      assert.ok(reply, 'unexpected request');
      calls.push({ url: url.href, options });
      options.lookup(url.hostname, {}, (error, address, family) => {
        assert.equal(error, null);
        assert.equal(address, addresses[0].address);
        assert.equal(family, addresses[0].family);
      });
      const response = Readable.from(reply.chunks ?? [Buffer.from('content')]);
      response.headers = { 'content-type': 'text/html', ...reply.headers };
      response.statusCode = reply.status ?? 200;
      response.complete = reply.complete ?? true;
      callback(response);
    });
    return request;
  };
  return { calls, resolveCalls, dependencies: {
    resolve: async hostname => { resolveCalls.push(hostname); return addresses; }, http, https: http,
  } };
}

const options = () => ({ signal: AbortSignal.timeout(1000), maxBytes: 32, kind: 'page' });

test('pins checked DNS to the actual request lookup, with no pooled sockets', async () => {
  const mock = mockNetwork([{}]);
  const result = await fetchCoverResource('https://example.com', options(), mock.dependencies);
  assert.equal(result.bytes.toString(), 'content');
  assert.equal(mock.resolveCalls.length, 1);
  assert.equal(mock.calls[0].options.agent, false);
  mock.calls[0].options.lookup('example.com', { all: true }, (error, records) => {
    assert.equal(error, null);
    assert.deepEqual(records, [{ address: '93.184.216.34', family: 4 }]);
  });
});

test('rejects mixed public/private DNS answers before connecting', async () => {
  const mock = mockNetwork([], [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }]);
  await assert.rejects(fetchCoverResource('https://example.com', options(), mock.dependencies));
  assert.equal(mock.calls.length, 0);
});

test('validates redirects, rejects private destinations and caps at three hops', async () => {
  const privateHop = mockNetwork([{ status: 302, headers: { location: 'http://127.0.0.1/a' } }]);
  await assert.rejects(fetchCoverResource('https://example.com', options(), privateHop.dependencies));
  assert.equal(privateHop.calls.length, 1);
  const mock = mockNetwork(Array.from({ length: 4 }, () => ({ status: 302, headers: { location: '/next' } })));
  await assert.rejects(fetchCoverResource('https://example.com', options(), mock.dependencies), /Redirect limit/);
  assert.equal(mock.calls.length, 4);
  assert.equal(mock.resolveCalls.length, 4);
});

test('rejects malformed, credentialed and non-HTTP redirects without uncaught errors', async () => {
  for (const location of ['http://[bad-address', 'https://user:pass@example.com/a', 'file:///etc/passwd', 'http://[::ffff:7f00:1]/a']) {
    const mock = mockNetwork([{ status: 302, headers: { location } }]);
    await assert.rejects(fetchCoverResource('https://example.com', options(), mock.dependencies));
    assert.equal(mock.calls.length, 1);
  }
});

test('rechecks DNS after every redirect, even on the same host', async () => {
  const mock = mockNetwork([{ status: 302, headers: { location: '/next' } }]);
  let resolutions = 0;
  mock.dependencies.resolve = async () => [{ address: ++resolutions === 1 ? '93.184.216.34' : '10.0.0.1', family: 4 }];
  await assert.rejects(fetchCoverResource('https://example.com', options(), mock.dependencies), /Non-public DNS answer/);
  assert.equal(mock.calls.length, 1);
  assert.equal(resolutions, 2);
});

test('resolves a relative redirect and returns the final source URL', async () => {
  const mock = mockNetwork([{ status: 302, headers: { location: '../poster' } }, {}]);
  const result = await fetchCoverResource('https://example.com/events/one', options(), mock.dependencies);
  assert.equal(result.url, 'https://example.com/poster');
  assert.equal(mock.calls.length, 2);
});

test('rejects overlong bodies, compressed data, bad MIME and truncated responses', async () => {
  for (const response of [
    { headers: { 'content-length': '100' } }, { chunks: [Buffer.alloc(33)] },
    { headers: { 'content-encoding': 'gzip' } }, { headers: { 'content-type': 'application/json' } },
    { complete: false }, { status: 404 },
  ]) {
    const mock = mockNetwork([response]);
    await assert.rejects(fetchCoverResource('https://example.com', options(), mock.dependencies));
  }
});

test('aborts stalled DNS and refuses already aborted requests without network work', async () => {
  const controller = new AbortController();
  let started = false;
  const mock = mockNetwork([]);
  mock.dependencies.resolve = () => { started = true; return new Promise(() => {}); };
  const pending = fetchCoverResource('https://example.com', { ...options(), signal: controller.signal }, mock.dependencies);
  controller.abort();
  await assert.rejects(pending);
  assert.equal(started, true);
  await assert.rejects(fetchCoverResource('https://example.com', { ...options(), signal: controller.signal }, mock.dependencies));
  assert.equal(mock.calls.length, 0);
});

test('passes cancellation to the socket request and destroys stalled requests on idle timeout', async () => {
  for (const abortRequest of [true, false]) {
    const controller = new AbortController();
    let destroyed = false;
    const http = (_url, requestOptions) => {
      assert.equal(requestOptions.signal, controller.signal);
      const request = new EventEmitter();
      request.destroy = error => { destroyed = true; request.emit('error', error); };
      request.setTimeout = (duration, callback) => {
        assert.equal(duration, 5000);
        if (!abortRequest) queueMicrotask(callback);
      };
      request.end = () => {
        requestOptions.signal.addEventListener('abort', () => request.destroy(new Error('aborted')), { once: true });
        if (abortRequest) queueMicrotask(() => controller.abort());
      };
      return request;
    };
    await assert.rejects(fetchCoverResource('https://example.com', { ...options(), signal: controller.signal }, {
      resolve: async () => [{ address: '93.184.216.34', family: 4 }], http, https: http,
    }));
    assert.equal(destroyed, true);
  }
});