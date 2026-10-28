import type { Metadata } from 'next';
import { siteUrl } from './site-url';

export type PublicPageMetadataInput = {
  title: string;
  description: string;
  path: string;
  image?: string | null;
};

export function isPublicIndexingAllowed(
  environment: { VERCEL_ENV?: string } = { VERCEL_ENV: process.env.VERCEL_ENV },
): boolean {
  return !environment.VERCEL_ENV || environment.VERCEL_ENV === 'production';
}

export function resolveSeoImage(image?: string | null): string | undefined {
  const value = image?.trim();
  if (!value) return undefined;
  try {
    const url = new URL(value.startsWith('/') ? siteUrl(value) : value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function publicPageMetadata({ title, description, path, image }: PublicPageMetadataInput): Metadata {
  const url = siteUrl(path);
  const socialImage = resolveSeoImage(image) ?? siteUrl('/opengraph-image');
  const index = isPublicIndexingAllowed();
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index, follow: index },
    openGraph: {
      type: 'website',
      locale: 'it_IT',
      siteName: 'EventScanner',
      title,
      description,
      url,
      images: [{ url: socialImage, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [socialImage],
    },
  };
}

export function serializeJsonLd(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError('JSON-LD must be serializable.');
  return json.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function getWebSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'EventScanner',
    url: siteUrl('/'),
    inLanguage: 'it-IT',
  };
}