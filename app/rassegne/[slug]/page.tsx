import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { publicPageMetadata, serializeJsonLd } from "../../../lib/seo-metadata";
import { siteUrl } from "../../../lib/site-url";
import { generateUniqueSlug } from "../../../lib/slug-utils";
import PageHeading from "../../components/PageHeading";
import { PUBLIC_EVENTS_TAG } from "../../../lib/public-event-cache";

export const revalidate = 60;

type SeriesEvent = {
  id: number;
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  category: string;
  imageUrl: string | null;
  media: { url: string }[];
};

function dateKey(value: string): string {
  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;
  const localDate = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (localDate) {
    return `${localDate[3]}-${localDate[2].padStart(2, "0")}-${localDate[1].padStart(2, "0")}`;
  }
  return "9999-99-99";
}

function dateLabel(key: string, fallback: string): string {
  const date = new Date(`${key}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? fallback
    : date.toLocaleDateString("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
}

function timeValue(value: string): number {
  const match = value.match(/(\d{1,2})[:.](\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.MAX_SAFE_INTEGER;
}

/** Full poster shared by the series: the saved "Locandina completa" or a cover used by every event. */
function seriesPoster(events: SeriesEvent[]): string | null {
  const saved = events.find((event) => event.media[0])?.media[0]?.url;
  if (saved) return saved;
  const covers = new Set(events.map((event) => event.imageUrl));
  const [shared] = covers;
  return events.length > 1 && covers.size === 1 && shared ? shared : null;
}

const getSeries = cache(unstable_cache(async (slug: string) => {
  return prisma.eventSeries.findUnique({
    where: { slug, isPublished: true },
    include: {
      events: {
        where: { isPublished: true },
        select: {
          id: true, title: true, description: true, date: true, time: true, location: true, category: true, imageUrl: true,
          media: { where: { kind: "image", fileName: "Locandina completa" }, select: { url: true }, orderBy: { position: "asc" }, take: 1 },
        },
      },
    },
  });
}, ["public-series-detail"], { tags: [PUBLIC_EVENTS_TAG], revalidate: 60 }));

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const series = await getSeries(slug);
  if (!series?.isPublished) return {
    title: "Rassegna non trovata",
    robots: { index: false, follow: false },
  };
  return publicPageMetadata({
    path: `/rassegne/${encodeURIComponent(series.slug)}`,
    title: series.title,
    description: series.description || `Programma completo di ${series.title} nell'Alto Vicentino.`,
  });
}

export default async function EventSeriesPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const series = await getSeries(slug);
  if (!series?.isPublished) notFound();

  const events = [...series.events].sort((first, second) =>
    dateKey(first.date).localeCompare(dateKey(second.date)) ||
    timeValue(first.time) - timeValue(second.time) ||
    first.title.localeCompare(second.title, "it"),
  );
  const dayGroups = new Map<string, SeriesEvent[]>();
  for (const event of events) {
    const key = dateKey(event.date);
    dayGroups.set(key, [...(dayGroups.get(key) ?? []), event]);
  }

  const posterUrl = seriesPoster(events);
  const url = siteUrl(`/rassegne/${encodeURIComponent(series.slug)}`);
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': url,
        url,
        name: series.title,
        ...(series.description ? { description: series.description } : {}),
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: events.length,
          itemListElement: events.map((event, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: event.title,
            url: siteUrl(`/events/${generateUniqueSlug(event.title, event.id)}`),
          })),
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl('/') },
          { '@type': 'ListItem', position: 2, name: 'Rassegne', item: siteUrl('/rassegne') },
          { '@type': 'ListItem', position: 3, name: series.title, item: url },
        ],
      },
    ],
  };

  return (
    <main className="min-h-screen page-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />
      <div className="editorial-container">
        <PageHeading
          className="page-heading-align-start"
          kicker="Programma"
          title={series.title}
          description={
            <Link href="/rassegne" className="font-semibold text-[#a33f24] underline underline-offset-4">Tutte le rassegne</Link>
          }
        />

        <div className={`grid gap-8 ${posterUrl ? "lg:grid-cols-[minmax(0,1fr)_minmax(280px,32vw)]" : ""}`}>
          <div>
            {series.description && <p className="mb-3 max-w-3xl whitespace-pre-line text-base leading-7 text-[var(--foreground-muted)]">{series.description}</p>}
            <p className="mb-0 text-sm font-semibold text-[var(--foreground-muted)]">{events.length} appuntamenti</p>
            {events.length ? (
              [...dayGroups.entries()].map(([key, items]) => (
                <section key={key} className="grid gap-4 border-b border-[var(--line)] py-7 md:grid-cols-[210px_minmax(0,1fr)] md:gap-8">
                  <h2 className="text-lg font-black capitalize text-[#f08b6b]">{dateLabel(key, items[0].date)}</h2>
                  <ol className="divide-y divide-black/10 bg-white">
                    {items.map((event) => (
                      <li key={event.id} className={`grid gap-2 px-4 py-4 sm:gap-4 md:px-5 ${event.imageUrl ? "sm:grid-cols-[74px_minmax(0,1fr)_144px]" : "sm:grid-cols-[74px_minmax(0,1fr)]"}`}>
                        <p className="text-sm font-black tabular-nums text-[#f08b6b]">{event.time || "Orario da definire"}</p>
                        <div>
                          <Link href={`/events/${event.id}`} className="font-bold hover:text-[#a33f24]">{event.title}</Link>
                          {event.location && <p className="mt-1 text-sm text-[var(--foreground-muted)]">{event.location}</p>}
                          {event.description && <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--foreground-muted)]">{event.description}</p>}
                        </div>
                        {event.imageUrl && (
                          <Link href={`/events/${event.id}`} className="order-first block self-start overflow-hidden border border-[var(--line)] sm:order-none" tabIndex={-1} aria-hidden="true">
                            <Image src={event.imageUrl} alt="" width={288} height={162} unoptimized className="aspect-video w-full object-cover" />
                          </Link>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
              ))
            ) : (
              <p className="border-b border-[var(--line)] py-10 text-sm text-[var(--foreground-muted)]">Il programma sarà disponibile a breve.</p>
            )}
          </div>
          {posterUrl && (
            <a href={posterUrl} target="_blank" rel="noreferrer" className="order-first block self-start overflow-hidden border border-[var(--line)] bg-[var(--surface)] lg:order-last">
              <Image src={posterUrl} alt={`Locandina di ${series.title}`} width={440} height={620} unoptimized className="h-auto w-full" />
            </a>
          )}
        </div>
      </div>
    </main>
  );
}