import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const blockedAddresses = new BlockList();

for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) {
  blockedAddresses.addSubnet(address, prefix, 'ipv4');
}

for (const [address, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32],
] as const) {
  blockedAddresses.addSubnet(address, prefix, 'ipv6');
}

export function isPublicPdfAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blockedAddresses.check(address, 'ipv4');
  if (family === 6) {
    const mappedIpv4 = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)?.[1];
    return mappedIpv4
      ? isPublicPdfAddress(mappedIpv4)
      : !blockedAddresses.check(address, 'ipv6');
  }
  return false;
}

export async function validatePublicPdfUrl(value: unknown): Promise<URL> {
  if (typeof value !== 'string') throw new Error('URL PDF non valido.');

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('URL PDF non valido.');
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Inserisci un URL PDF pubblico valido.');
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Il PDF deve essere ospitato su un server pubblico.');
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('Impossibile raggiungere il server del PDF.');
  }
  if (!addresses.length || addresses.some(({ address }) => !isPublicPdfAddress(address))) {
    throw new Error('Il PDF deve essere ospitato su un server pubblico.');
  }

  return url;
}