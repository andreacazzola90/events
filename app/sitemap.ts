import { MetadataRoute } from "next";
import { prisma } from "./lib/prisma";
import { generateUniqueSlug } from "../lib/slug-utils";
import { siteUrl } from "../lib/site-url";
import { isPublicIndexingAllowed } from "../lib/seo-metadata";

export const revalidate = 3600;

const MAX_SITEMAP_URLS = 50_000;
const PUBLIC_PATHS = ['/', '/eventi', '/tutti-gli-eventi', '/mappa', '/rassegne', '/estensione', '/versioni', '/ui-ux'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isPublicIndexingAllowed()) return [];
  const urls: MetadataRoute.Sitemap = PUBLIC_PATHS.map((path) => ({ url: siteUrl(path) }));

  try {
    const remaining = MAX_SITEMAP_URLS - urls.length;
    const series = await prisma.eventSeries.findMany({
      where: { isPublished: true },
      select: { slug: true, updatedAt: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: remaining + 1,
    });
    urls.push(...series.slice(0, remaining).map((item) => ({
      url: siteUrl(`/rassegne/${encodeURIComponent(item.slug)}`),
      lastModified: item.updatedAt,
    })));
    if (series.length > remaining) console.warn('[sitemap] URL limit reached; older records omitted.');
  } catch {
    console.warn('[sitemap] Published series unavailable; continuing with available public URLs.');
  }

  const remaining = MAX_SITEMAP_URLS - urls.length;
  if (remaining > 0) {
    try {
      const events = await prisma.event.findMany({
        select: { id: true, title: true, updatedAt: true },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: remaining + 1,
      });
      urls.push(...events.slice(0, remaining).map((event) => ({
        url: siteUrl(`/events/${generateUniqueSlug(event.title, event.id)}`),
        lastModified: event.updatedAt,
      })));
      if (events.length > remaining) console.warn('[sitemap] URL limit reached; older records omitted.');
    } catch {
      console.warn('[sitemap] Events unavailable; continuing with available public URLs.');
    }
  }
  return urls;
}
