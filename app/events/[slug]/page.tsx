import { CalendarIcon, ClockIcon, MapPinIcon } from '../../components/EventIcons';
import { extractIdFromSlug, generateUniqueSlug } from '../../../lib/slug-utils';
import { TransitionLink } from '../../components/TransitionLink';
import { prisma } from '../../lib/prisma';
import { notFound } from 'next/navigation';
import EventActions from './EventActions';

export const revalidate = 60; // ISR: Revalidate every 60 seconds

export async function generateStaticParams() {
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
    const similarEvents = await prisma.event.findMany({
        where: {
            AND: [
                { id: { not: currentEvent.id } }, // Exclude current event
                {
                    OR: [
                        { category: currentEvent.category }, // Same category
                        { location: { contains: currentEvent.location.split(',')[0] } }, // Same city/area
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

    const sameDayEvents = await getSameDayEvents(event.date, event.id);
    const similarEvents = await getSimilarEvents(event);

    return (
        <div className="min-h-screen py-8 px-2 bg-light w-full">
            <div className="container mx-auto px-8">
                <div className="w-full space-y-8">

                    {/* Desktop Layout: Image Left + Content Right */}
                    <div className="lg:flex lg:gap-8 lg:items-start">
                        {/* Left Column - Image (Desktop) - 1/4 dello spazio */}
                        <div className="lg:w-1/4 event-image-sticky">
                            {event.imageUrl && (
                                <div className="relative group event-image-container">
                                    <img
                                        src={event.imageUrl.startsWith('/uploads/') ? event.imageUrl : event.imageUrl}
                                        alt={event.title}
                                        className="w-full h-64 sm:h-80 lg:h-[400px] xl:h-[450px] object-cover transition-all duration-700"
                                    />
                                    {/* Gradient Overlay */}
                                    <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                </div>
                            )}
                            {!event.imageUrl && (
                                <div className="relative group event-image-container">
                                    {/* Placeholder or empty */}
                                </div>
                            )}
                        </div>

                        {/* Right Column - Content (Desktop) / Full Width (Mobile) - 3/4 dello spazio */}
                        <div className="lg:w-3/4 mt-8 lg:mt-0">
                            <div className="event-content-card">
                                <div className="space-y-8">
                                    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold bg-gradient-text bg-clip-text text-transparent leading-tight">{event.title}</h1>

                                    {/* Event Info Grid */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-lg">
                                        <div className="space-y-4">
                                            <p className="flex items-center gap-3 text-white"><CalendarIcon className="w-6 h-6 text-primary shrink-0" /> <span>{event.date}</span></p>
                                            <p className="flex items-center gap-3 text-white"><ClockIcon className="w-6 h-6 text-primary shrink-0" /> <span>{event.time}</span></p>
                                            <p className="flex items-center gap-3 text-white">
                                                <MapPinIcon className="w-6 h-6 text-primary shrink-0" />
                                                <a
                                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="hover:text-primary hover:underline transition-colors"
                                                >
                                                    {event.location}
                                                </a>
                                            </p>
                                        </div>
                                        <div className="space-y-4">
                                            {event.category && <p className="flex items-center gap-3 text-white"><span className="text-2xl shrink-0">🏷️</span> <span>{event.category}</span></p>}
                                            {event.organizer && <p className="flex items-center gap-3 text-white"><span className="text-2xl shrink-0">👤</span> <span>{event.organizer}</span></p>}
                                            {event.price && <p className="flex items-center gap-3 text-white"><span className="text-2xl shrink-0">💰</span> <span>{event.price}</span></p>}
                                        </div>
                                    </div>

                                    <div className="border-t border-white/20 pt-6">
                                        <div className="flex items-start gap-3">
                                            <svg className="w-8 h-8 text-white shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                            </svg>
                                            <p className="text-gray-300 whitespace-pre-wrap text-lg leading-relaxed flex-1">{event.description}</p>
                                        </div>
                                    </div>

                                    {event.sourceUrl && (
                                        <div className="border-t border-white/20 pt-6">
                                            <div className="flex items-start gap-3">
                                                <svg className="w-7 h-7 text-white shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                                                </svg>
                                                <a
                                                    href={event.sourceUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-primary hover:text-accent underline text-lg break-all flex-1"
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

                    {/* Same Day Events */}
                    {sameDayEvents.length > 0 && (
                        <div className="glass-effect rounded-3xl p-8 w-full max-w-full border border-white/10">
                            <h2 className="text-3xl font-bold bg-gradient-text bg-clip-text text-transparent mb-6">Altri Eventi dello Stesso Giorno</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {sameDayEvents.map((sameDayEvent) => (
                                    <TransitionLink
                                        key={sameDayEvent.id}
                                        href={`/events/${generateUniqueSlug(sameDayEvent.title, sameDayEvent.id)}`}
                                        className="glass-effect p-6 rounded-xl cursor-pointer hover:shadow-glow hover:scale-105 transition-all duration-300 border border-white/10 hover:border-primary/50 group block"
                                    >
                                        {sameDayEvent.imageUrl && (
                                            <img
                                                src={sameDayEvent.imageUrl.startsWith('/uploads/') ? sameDayEvent.imageUrl : sameDayEvent.imageUrl}
                                                alt={sameDayEvent.title}
                                                className="w-full h-48 object-cover rounded-lg mb-3"
                                            />
                                        )}
                                        <h3 className="font-bold text-xl mb-2 text-white group-hover:text-primary transition-colors truncate">{sameDayEvent.title}</h3>
                                        <p className="text-gray-400 text-sm mb-3 line-clamp-2">{sameDayEvent.description}</p>
                                        <div className="space-y-1 text-sm text-gray-400">
                                            <p className="flex items-center gap-2"><ClockIcon className="w-5 h-5 text-primary shrink-0" /> <span className="truncate">{sameDayEvent.time}</span></p>
                                            <p className="flex items-center gap-2"><MapPinIcon className="w-5 h-5 text-primary shrink-0" /> <span className="truncate">{sameDayEvent.location}</span></p>
                                        </div>
                                    </TransitionLink>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Similar Events */}
                    {similarEvents.length > 0 && (
                        <div className="glass-effect rounded-3xl p-6 w-full max-w-full border border-white/10">
                            <h2 className="text-3xl font-bold mb-6 bg-gradient-text bg-clip-text text-transparent">Eventi Simili</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {similarEvents.map((similarEvent) => (
                                    <TransitionLink
                                        key={similarEvent.id}
                                        href={`/events/${generateUniqueSlug(similarEvent.title, similarEvent.id)}`}
                                        className="glass-effect p-4 rounded-lg cursor-pointer hover:shadow-glow hover:scale-105 transition-all duration-300 border border-white/10 hover:border-primary/50 group block"
                                    >
                                        {similarEvent.imageUrl && (
                                            <img
                                                src={similarEvent.imageUrl.startsWith('/uploads/') ? similarEvent.imageUrl : similarEvent.imageUrl}
                                                alt={similarEvent.title}
                                                className="w-full h-48 object-cover rounded mb-2"
                                            />
                                        )}
                                        <h3 className="font-semibold text-lg text-white group-hover:text-primary transition-colors truncate">{similarEvent.title}</h3>
                                        <p className="text-gray-400 text-sm line-clamp-2">{similarEvent.description}</p>
                                        <div className="mt-2 text-sm text-gray-400">
                                            <p className="flex items-center gap-2"><CalendarIcon className="w-5 h-5 text-primary shrink-0" /> <span className="truncate">{similarEvent.date}</span></p>
                                            <p className="flex items-center gap-2"><MapPinIcon className="w-5 h-5 text-primary shrink-0" /> <span className="truncate">{similarEvent.location}</span></p>
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