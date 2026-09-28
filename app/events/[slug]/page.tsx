import Image from 'next/image';
import type { Metadata } from 'next';
import { CalendarIcon, ClockIcon, MapPinIcon } from '../../components/EventIcons';
import { extractIdFromSlug, generateUniqueSlug, getPrimaryLocationToken } from '../../../lib/slug-utils';
import { TransitionLink } from '../../components/TransitionLink';
import { prisma } from '../../lib/prisma';
import FavoriteButton from '../../components/FavoriteButton';
import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../pages/api/auth/[...nextauth]';
import SaveToCalendarButton from './SaveToCalendarButton';

export const revalidate = 60; // ISR: Revalidate every 60 seconds

const BASE_URL = "https://events-scanner.vercel.app";

export async function generateMetadata(
    { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
    const { slug } = await params;
    const event = await getEvent(slug);

    if (!event) {
        return {
            title: "Evento non trovato",
            description: "L'evento che stai cercando non esiste o è stato rimosso.",
        };
    }

    const title = `${event.title} | EventScanner`;
    const description = event.description
        ? event.description.slice(0, 155)
        : `${event.title} — ${event.date}${event.location ? ` a ${event.location}` : ""}. Scopri tutti i dettagli su EventScanner.`;
    const eventUrl = `${BASE_URL}/events/${slug}`;

    return {
        title,
        description,
        keywords: [
            event.title,
            event.location,
            "eventi schio",
            "eventi alto vicentino",
            "eventi vicenza",
            event.category ?? "evento",
        ].filter(Boolean) as string[],
        openGraph: {
            type: "article",
            locale: "it_IT",
            url: eventUrl,
            siteName: "EventScanner",
            title,
            description,
            ...(event.imageUrl ? { images: [{ url: event.imageUrl, alt: event.title }] } : {}),
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            ...(event.imageUrl ? { images: [event.imageUrl] } : {}),
        },
        alternates: {
            canonical: eventUrl,
        },
    };
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

async function getEvent(slug: string) {
    const eventId = extractIdFromSlug(slug);
    if (!eventId) return null;

    const event = await prisma.event.findUnique({
        where: { id: eventId },
    });

    return event;
}

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

async function getUserCalendarEmail(userId: number): Promise<string | null> {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { calendarEmail: true },
        });
        return user?.calendarEmail ?? null;
    } catch (error: any) {
        const message = String(error?.message || "");
        const isMissingColumn =
            error?.code === 'P2022' ||
            error?.code === 'P2021' ||
            message.includes('calendarEmail') ||
            message.includes('does not exist') ||
            message.includes('column');

        if (isMissingColumn) {
            return null;
        }

        throw error;
    }
}

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const event = await getEvent(slug);

    if (!event) {
        notFound();
    }

    const session: any = await getServerSession(authOptions as any);
    const sessionUser = session?.user as any;
    const sessionUserId = parseInt((sessionUser?.id || '').toString(), 10);
    const sessionEmail = (sessionUser?.email || '').toLowerCase();
    const isAdmin =
        sessionUser?.role === 'admin' ||
        sessionUser?.type === 'admin' ||
        sessionEmail === 'andreacazzola90@gmail.com' ||
        sessionEmail.startsWith('andreacazzola90@');

    const canEdit =
        isAdmin ||
        (!Number.isNaN(sessionUserId) && event.createdById === sessionUserId);

    const calendarEmail = Number.isNaN(sessionUserId)
        ? null
        : await getUserCalendarEmail(sessionUserId);

    const sameDayEvents = await getSameDayEvents(event.date, event.id);
    const similarEvents = await getSimilarEvents(event);

    return (
        <div className="min-h-screen page-shell w-full event-detail-page">
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
                                        </div>
                                        {(canEdit || calendarEmail) && (
                                            <div className="flex flex-wrap gap-3">
                                                {calendarEmail && <SaveToCalendarButton eventId={event.id} />}
                                                {canEdit && (
                                                    <TransitionLink
                                                        href={`/events/${slug}/edit`}
                                                        className="industrial-link industrial-link-primary no-underline hover:no-underline whitespace-nowrap"
                                                    >
                                                        ✏️ Modifica <span aria-hidden="true">↗</span>
                                                    </TransitionLink>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-base">
                                        <div className="space-y-4">
                                            <p className="flex items-center gap-3 text-[#1d1d1b]"><CalendarIcon className="w-5 h-5 text-[#d65a38] shrink-0" /> <span>{event.date}</span></p>
                                            <p className="flex items-center gap-3 text-[#1d1d1b]"><ClockIcon className="w-5 h-5 text-[#d65a38] shrink-0" /> <span>{event.time}</span></p>
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