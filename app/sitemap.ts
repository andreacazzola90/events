import { MetadataRoute } from 'next';
import { prisma } from './lib/prisma';
import { generateUniqueSlug } from '../lib/slug-utils';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://events-scanner.vercel.app';

  // Fetch all events from the database
  const events = await prisma.event.findMany({
    select: {
      id: true,
      title: true,
      updatedAt: true,
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });

  const eventUrls = events.map((event) => ({
    url: `${baseUrl}/events/${generateUniqueSlug(event.title, event.id)}`,
    lastModified: event.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  const staticUrls = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/mappa`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/crea`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    },
  ];

  return [...staticUrls, ...eventUrls];
}
