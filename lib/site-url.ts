export const DEFAULT_SITE_URL = 'https://events-scanner.vercel.app';

export function getSiteUrl(value = process.env.NEXT_PUBLIC_SITE_URL): string {
  if (!value?.trim()) return DEFAULT_SITE_URL;
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('NEXT_PUBLIC_SITE_URL deve essere un URL HTTPS pubblico senza credenziali.');
  }
  return url.origin;
}

export function siteUrl(path = '/'): string {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Percorso pubblico non valido.');
  const origin = getSiteUrl();
  const url = new URL(path, origin);
  if (url.origin !== origin) throw new Error('Percorso pubblico non valido.');
  return url.href;
}