import Image from 'next/image';
import type { Metadata } from 'next';
import { cache } from 'react';
import { CalendarIcon, ClockIcon, MapPinIcon } from '../../components/EventIcons';
import { generateUniqueSlug, getPrimaryLocationToken } from '../../../lib/slug-utils';
import { getEventBreadcrumbJsonLd, getEventIdFromSlug, getEventJsonLd, getEventMetadata, getEventPath, getEventStartDate } from '../../../lib/event-seo';
import { publicPageMetadata, serializeJsonLd } from '../../../lib/seo-metadata';
import { TransitionLink } from '../../components/TransitionLink';
import { prisma } from '../../lib/prisma';
import FavoriteButton from '../../components/FavoriteButton';
import { notFound, permanentRedirect } from 'next/navigation';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../pages/api/auth/[...nextauth]';

export const revalidate = 60; // ISR: Revalidate every 60 seconds

export async function generateMetadata(
    { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
    const { slug } = await params;
    const event = await getEvent(slug);

    if (!event) {
        return {
            ...publicPageMetadata({
                title: "Evento non trovato",
                description: "L'evento che stai cercando non esiste o è stato rimosso.",
                path: `/events/${encodeURIComponent(slug)}`,
            }),
            robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
        };
    }

    return getEventMetadata(event);
}

export async function generateStaticParams() {
    try {
        const events = await prisma.event.findMany({
            select: {
                id: true,
                title: true,
            },
            take: 10, // Limit to latest 10 events to avoid DB connection limits during build
            orderBy: {
                date: 'desc',
            },
        });

        return events.map((event) => ({
            slug: generateUniqueSlug(event.title, event.id),
        }));
    } catch (error) {
        console.error('[events/[slug]] generateStaticParams failed, falling back to runtime rendering:', error);
        return [];
    }
}

const getEvent = cache(async (slug: string) => {
    const eventId = getEventIdFromSlug(slug);
    if (!eventId) return null;

    const event = await prisma.event.findUnique({
        where: { id: eventId },
           include: {
               media: { orderBy: { position: 'asc' } },
               eventSeries: { select: { title: true, slug: true, isPublished: true } },
           },
    });

    return event;
});

async function getSameDayEvents(date: string, currentEventId: number) {
    const events = await prisma.event.findMany({
        where: {
            date: date,
            id: { not: currentEventId },
        },
    });
    return events;
}

async function getSimilarEvents(currentEvent: any) {
    const primaryLocationToken = getPrimaryLocationToken(currentEvent.location);

    const similarEvents = await prisma.event.findMany({
        where: {
            AND: [
                { id: { not: currentEvent.id } }, // Exclude current event
                {
                    OR: [
                        ...(currentEvent.category ? [{ category: currentEvent.category }] : []), // Same category
                        ...(primaryLocationToken ? [{ location: { contains: primaryLocationToken } }] : []), // Same city/area
                        {
                            AND: [
                                { date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] } }, // Events in the next week
                                { date: { lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] } }
                            ]
                        }
                    ]
                }
            ]
        },
        take: 6, // Limit to 6 similar events
        orderBy: [
            { category: 'desc' }, // Prioritize same category
            { date: 'asc' } // Then by date
        ],
    });
    return similarEvents;
}

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const event = await getEvent(slug);

    if (!event) {
        notFound();
    }

    const canonicalPath = getEventPath(event);
    if (`/events/${slug}` !== canonicalPath) {
        permanentRedirect(canonicalPath);
    }
    const eventJsonLd = getEventJsonLd(event);
    const startDate = getEventStartDate(event.date, event.time);

    const session: any = await getServerSession(authOptions as any);
    const sessionUser = session?.user as any;
    const sessionUserId = parseInt((sessionUser?.id || '').toString(), 10);
    const sessionEmail = (sessionUser?.email || '').toLowerCase();
    const isAdmin =
        sessionUser?.role === 'admin' ||
        sessionUser?.type === 'admin' ||
        sessionEmail === 'andreacazzola90@gmail.com';

    const canEdit =
        isAdmin ||
        (!Number.isNaN(sessionUserId) && event.createdById === sessionUserId);

    const sameDayEvents = await getSameDayEvents(event.date, event.id);
    const similarEvents = await getSimilarEvents(event);

    return (
        <div className="min-h-screen page-shell w-full event-detail-page">
            {eventJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(eventJsonLd) }} />}
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(getEventBreadcrumbJsonLd(event)) }} />
            <div className="editorial-container">
                <div className="w-full space-y-8">
                    <div className="lg:flex lg:gap-8 lg:items-start">
                        <div className="lg:w-1/4 event-image-sticky">
                            {event.imageUrl && (
                                <div className="relative group event-image-container">
                                    <FavoriteButton eventId={event.id} />
                                    <Image
                                        src={event.imageUrl.startsWith('/uploads/') ? event.imageUrl : event.imageUrl}
                                        alt={event.title}
                                        width={800}
                                        height={600}
                                        className="w-full h-64 sm:h-80 lg:h-[30rem] object-cover transition-all duration-700"
                                        sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, 100vw"
                                        priority
                                    />
                                </div>
                            )}
                            {!event.imageUrl && (
                                <div className="relative group event-image-container bg-[#f4f1eb]" />
                            )}
                        </div>

                        <div className="lg:w-3/4 mt-8 lg:mt-0">
                            <div className="surface-panel p-5 md:p-8">
                                <div className="space-y-8">
                                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                                        <div>
                                            <p className="section-kicker mb-3">Evento</p>
                                            <h1 className="section-title mb-0 text-[#1d1d1b]">{event.title}</h1>
                                            {event.eventSeries?.isPublished && (
                                                <TransitionLink
                                                    href={`/rassegne/${event.eventSeries.slug}`}
                                                    className="mt-3 inline-flex text-sm font-semibold text-[#a33f24] underline underline-offset-4"
                                                >
                                                    Programma completo: {event.eventSeries.title}
                                                </TransitionLink>
                                            )}
                                        </div>
                                        {canEdit && (
                                            <div className="flex flex-wrap gap-3">
                                                <TransitionLink
                                                    href={`/events/${slug}/edit`}
                                                    className="industrial-link industrial-link-primary no-underline hover:no-underline whitespace-nowrap"
                                                >
                                                    ✏️ Modifica <span aria-hidden="true">↗</span>
                                                </TransitionLink>
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-base">
                                        <div className="space-y-4">
                                            <p className="flex items-center gap-3 text-[#1d1d1b]"><CalendarIcon className="w-5 h-5 text-[#d65a38] shrink-0" /> {startDate ? <time dateTime={startDate.slice(0, 10)}>{event.date}</time> : <span>{event.date}</span>}</p>
                                            <p className="flex items-center gap-3 text-[#1d1d1b]"><ClockIcon className="w-5 h-5 text-[#d65a38] shrink-0" /> {startDate?.includes('T') ? <time dateTime={startDate}>{event.time}</time> : <span>{event.time}</span>}</p>
                                            <p className="flex items-center gap-3 text-[#1d1d1b]">
                                                <MapPinIcon className="w-5 h-5 text-[#d65a38] shrink-0" />
                                                <a
                                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-[#1d1d1b] hover:text-[#d65a38] underline underline-offset-4 transition-colors"
                                                >
                                                    {event.location}
                                                </a>
                                            </p>
                                        </div>
                                        <div className="space-y-4">
                                            {event.category && <p className="flex items-center gap-3 text-[#1d1d1b]"><span className="text-xl shrink-0">🏷️</span> <span>{event.category}</span></p>}
                                            {event.organizer && <p className="flex items-center gap-3 text-[#1d1d1b]"><span className="text-xl shrink-0">👤</span> <span>{event.organizer}</span></p>}
                                            {event.price && <p className="flex items-center gap-3 text-[#1d1d1b]"><span className="text-xl shrink-0">💰</span> <span>{event.price}</span></p>}
                                        </div>
                                    </div>

                                    <div className="border-t border-black/10 pt-6">
                                        <div className="flex items-start gap-3">
                                            <svg className="w-7 h-7 text-[#d65a38] shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                            </svg>
                                            <p className="text-[#5f5b56] whitespace-pre-wrap text-base leading-relaxed flex-1">{event.description}</p>
                                        </div>
                                    </div>

                                    {event.sourceUrl && (
                                        <div className="border-t border-black/10 pt-6">
                                            <div className="flex items-start gap-3">
                                                <svg className="w-6 h-6 text-[#d65a38] shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                                                </svg>
                                                <a
                                                    href={event.sourceUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-[#1d1d1b] hover:text-[#d65a38] underline underline-offset-4 text-base break-all flex-1"
                                                >
                                                    {event.sourceUrl}
                                                </a>
                                            </div>
                                        </div>
                                    )}

                                    {event.media?.length > 0 && (
                                        <section className="border-t border-black/10 pt-6 space-y-4" aria-labelledby="event-media-heading">
                                            <h2 id="event-media-heading" className="text-xl font-bold text-[#1d1d1b]">Immagini e documenti</h2>
                                            {event.media.some((media: { kind: string }) => media.kind === 'image') && (
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                    {event.media.filter((media: { kind: string }) => media.kind === 'image').map((media: { id: number; url: string; fileName: string }) => (
                                                        <a key={media.id} href={media.url} target="_blank" rel="noreferrer" className="block overflow-hidden border border-black/10 bg-white">
                                                            <Image src={media.url} alt={media.fileName} width={480} height={320} unoptimized className="w-full aspect-[3/2] object-cover" />
                                                            <span className="block px-2 py-1 text-xs text-[#5f5b56] truncate">{media.fileName}</span>
                                                        </a>
                                                    ))}
                                                </div>
                                            )}
                                            {event.media.some((media: { kind: string }) => media.kind === 'pdf') && (
                                                <ul className="space-y-2">
                                                    {event.media.filter((media: { kind: string }) => media.kind === 'pdf').map((media: { id: number; url: string; fileName: string; sizeBytes: number }) => (
                                                        <li key={media.id}>
                                                            <a href={media.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[#1d1d1b] underline underline-offset-4">
                                                                <span aria-hidden="true" className="text-xs font-bold text-[#d65a38]">PDF</span>
                                                                <span>{media.fileName}</span>
                                                                <span className="text-xs text-[#686868]">({(media.sizeBytes / (1024 * 1024)).toFixed(1)} MB)</span>
                                                            </a>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </section>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {sameDayEvents.length > 0 && (
                        <div className="surface-panel p-5 md:p-8 w-full max-w-full">
                            <h2 className="text-3xl font-black tracking-[-0.06em] mb-6 text-[#1d1d1b]">Altri Eventi dello Stesso Giorno</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {sameDayEvents.map((sameDayEvent) => (
                                    <TransitionLink
                                        key={sameDayEvent.id}
                                        href={`/events/${generateUniqueSlug(sameDayEvent.title, sameDayEvent.id)}`}
                                        className="group block rounded-none border border-black/10 bg-white p-4 transition-all duration-300 hover:-translate-y-1 hover:border-[#d65a38] hover:shadow-[0_12px_30px_rgba(214,90,56,0.08)]"
                                    >
                                        {sameDayEvent.imageUrl && (
                                            <Image
                                                src={sameDayEvent.imageUrl.startsWith('/uploads/') ? sameDayEvent.imageUrl : sameDayEvent.imageUrl}
                                                alt={sameDayEvent.title}
                                                width={400}
                                                height={300}
                                                className="w-full h-44 object-cover mb-3"
                                                sizes="(min-width: 1024px) 25vw, 50vw"
                                                loading="lazy"
                                            />
                                        )}
                                        <h3 className="font-bold text-xl mb-2 text-[#1d1d1b] truncate group-hover:text-[#d65a38] transition-colors">{sameDayEvent.title}</h3>
                                        <p className="text-[#5f5b56] text-sm mb-3 line-clamp-2">{sameDayEvent.description}</p>
                                        <div className="space-y-1 text-sm text-[#5f5b56]">
                                            <p className="flex items-center gap-2"><ClockIcon className="w-4 h-4 text-[#d65a38] shrink-0" /> <span className="truncate">{sameDayEvent.time}</span></p>
                                            <p className="flex items-center gap-2"><MapPinIcon className="w-4 h-4 text-[#d65a38] shrink-0" /> <span className="truncate">{sameDayEvent.location}</span></p>
                                        </div>
                                    </TransitionLink>
                                ))}
                            </div>
                        </div>
                    )}

                    {similarEvents.length > 0 && (
                        <div className="surface-panel p-5 md:p-8 w-full max-w-full">
                            <h2 className="text-3xl font-black tracking-[-0.06em] mb-6 text-[#1d1d1b]">Eventi Simili</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {similarEvents.map((similarEvent) => (
                                    <TransitionLink
                                        key={similarEvent.id}
                                        href={`/events/${generateUniqueSlug(similarEvent.title, similarEvent.id)}`}
                                        className="group block rounded-none border border-black/10 bg-white p-4 transition-all duration-300 hover:-translate-y-1 hover:border-[#d65a38] hover:shadow-[0_12px_30px_rgba(214,90,56,0.08)]"
                                    >
                                        {similarEvent.imageUrl && (
                                            <Image
                                                src={similarEvent.imageUrl.startsWith('/uploads/') ? similarEvent.imageUrl : similarEvent.imageUrl}
                                                alt={similarEvent.title}
                                                width={400}
                                                height={300}
                                                className="w-full h-44 object-cover mb-3"
                                                sizes="(min-width: 1024px) 25vw, 50vw"
                                                loading="lazy"
                                            />
                                        )}
                                        <h3 className="font-bold text-lg text-[#1d1d1b] truncate group-hover:text-[#d65a38] transition-colors">{similarEvent.title}</h3>
                                        <p className="text-[#5f5b56] text-sm line-clamp-2 mt-2">{similarEvent.description}</p>
                                        <div className="mt-3 text-sm text-[#5f5b56]">
                                            <p className="flex items-center gap-2"><CalendarIcon className="w-4 h-4 text-[#d65a38] shrink-0" /> <span className="truncate">{similarEvent.date}</span></p>
                                            <p className="flex items-center gap-2"><MapPinIcon className="w-4 h-4 text-[#d65a38] shrink-0" /> <span className="truncate">{similarEvent.location}</span></p>
                                        </div>
                                    </TransitionLink>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}