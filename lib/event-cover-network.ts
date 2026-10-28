import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20],
] as const) blocked.addSubnet(address, prefix, 'ipv6');

export function isPublicCoverAddress(address: string): boolean {
  if (isIP(address) === 4) return !blocked.check(address, 'ipv4');
  return isIP(address) === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

export function coverUrl(value: string): URL {
  if (value.length > 2048) throw new Error('Invalid URL');
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port ||
      !hostname || /(?:^|\.)(?:localhost|local|internal|lan|home|invalid|test)$/.test(hostname) ||
      (isIP(hostname) && !isPublicCoverAddress(hostname))) throw new Error('Non-public URL');
  url.hash = '';
  return url;
}

export function withCoverAbort<Value>(operation: Promise<Value>, signal: AbortSignal): Promise<Value> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('Request aborted'));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

type Addresses = { address: string; family: number }[];
type NetworkDependencies = {
  resolve: (hostname: string) => Promise<Addresses>;
  http: typeof httpRequest;
  https: typeof httpsRequest;
};
const network: NetworkDependencies = {
  resolve: hostname => lookup(hostname, { all: true, verbatim: true }),
  http: httpRequest,
  https: httpsRequest,
};

export async function fetchCoverResource(
  value: string,
  options: { signal: AbortSignal; maxBytes: number; kind: 'page' | 'image' },
  dependencies: NetworkDependencies = network,
): Promise<{ bytes: Buffer; url: string }> {
  let url = coverUrl(value);
  for (let hop = 0; hop <= 3; hop++) {
    options.signal.throwIfAborted();
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await withCoverAbort(dependencies.resolve(hostname), options.signal);
    if (!addresses.length || addresses.some(entry => !isPublicCoverAddress(entry.address))) {
      throw new Error('Non-public DNS answer');
    }
    const pinned = addresses[0];
    const currentUrl = url;
    const result = await new Promise<{ bytes: Buffer; redirect?: string }>((resolve, reject) => {
      const request = (url.protocol === 'https:' ? dependencies.https : dependencies.http)(url, {
        agent: false,
        signal: options.signal,
        lookup: (_hostname, lookupOptions, callback) => {
          if (lookupOptions.all) callback(null, [pinned]);
          else callback(null, pinned.address, pinned.family);
        },
        headers: {
          Accept: options.kind === 'page' ? 'text/html,application/xhtml+xml' : 'image/jpeg,image/png,image/webp,image/gif',
          'Accept-Encoding': 'identity',
          'User-Agent': 'EventCover/1.0',
        },
      }, response => {
        response.on('error', reject);
        const status = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          const location = response.headers.location;
          response.destroy();
          if (!location || hop === 3) reject(new Error('Redirect limit'));
          else {
            try { resolve({ bytes: Buffer.alloc(0), redirect: coverUrl(new URL(location, currentUrl).href).href }); }
            catch { reject(new Error('Invalid redirect')); }
          }
          return;
        }
        const contentType = (response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
        const allowed = options.kind === 'page'
          ? ['text/html', 'application/xhtml+xml']
          : ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
        const encoding = response.headers['content-encoding'];
        if (status !== 200 || !allowed.includes(contentType) || (encoding && encoding !== 'identity') ||
            Number(response.headers['content-length']) > options.maxBytes) {
          response.destroy();
          reject(new Error('Invalid resource'));
          return;
        }
        const chunks: Buffer[] = [];
        let received = 0;
        response.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > options.maxBytes) {
            response.destroy();
            reject(new Error('Resource too large'));
          } else chunks.push(chunk);
        });
        response.on('aborted', () => reject(new Error('Truncated response')));
        response.on('end', () => {
          if (!response.complete) reject(new Error('Truncated response'));
          else resolve({ bytes: Buffer.concat(chunks) });
        });
      });
      request.on('error', reject);
      request.setTimeout(5000, () => request.destroy(new Error('Idle timeout')));
      request.end();
    });
    if (!result.redirect) return { bytes: result.bytes, url: url.href };
    url = coverUrl(result.redirect);
  }
  throw new Error('Redirect limit');
}