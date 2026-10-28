import type { MetadataRoute } from 'next';
import { siteUrl } from '../lib/site-url';
import { isPublicIndexingAllowed } from '../lib/seo-metadata';

export default function robots(): MetadataRoute.Robots {
  const disallow = ['/api/'];
  if (!isPublicIndexingAllowed()) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
      {
        userAgent: ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot'],
        allow: '/',
        disallow,
      },
    ],
    sitemap: siteUrl('/sitemap.xml'),
    host: siteUrl('/'),
  };
}