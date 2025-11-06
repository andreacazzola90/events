'use client';

import { useState, useEffect } from 'react';
import { CalendarIcon, ClockIcon, MapPinIcon } from '../../components/EventIcons';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { extractIdFromSlug, generateUniqueSlug } from '../../../lib/slug-utils';
import { TransitionLink } from '../../components/TransitionLink';

interface Event {
    id: number;
    title: string;
    description: string;
    date: string;
    time: string;
    location: string;
    organizer: string;
    category: string;
    price: string;
    rawText: string;
    imageUrl: string | null;
    createdAt: string;
    updatedAt: string;
}

interface SimilarEvent {
    id: number;
    title: string;
    description: string;
    date: string;
    time: string;
    location: string;
    category: string;
    imageUrl: string | null;
}

export default function EventDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [event, setEvent] = useState<Event | null>(null);
    const [similarEvents, setSimilarEvents] = useState<SimilarEvent[]>([]);
    const [sameDayEvents, setSameDayEvents] = useState<SimilarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { data: session } = useSession();

    useEffect(() => {
        if (params && params.slug) {
            const eventId = extractIdFromSlug(params.slug as string);
            if (eventId) {
                fetchEvent(eventId);
                fetchSimilarEvents(eventId);
                // Scroll to top when event changes
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                setError('Invalid event URL');
                setLoading(false);
            }
        }
    }, [params?.slug]);

    const fetchEvent = async (eventId: number) => {
        try {
            const response = await fetch(`/api/events/${eventId}`);
            if (response.ok) {
                const data = await response.json();
                setEvent(data);
                // Fetch eventi dello stesso giorno
                fetchSameDayEvents(data.date, eventId);
            } else {
                setError('Evento non trovato');
            }
        } catch (error) {
            console.error('Error fetching event:', error);
            setError('Errore nel caricamento dell\'evento');
        } finally {
            setLoading(false);
        }
    };

    const fetchSameDayEvents = async (eventDate: string, currentEventId: number) => {
        try {
            const response = await fetch(`/api/events`);
            if (response.ok) {
                const allEvents = await response.json();
                const filtered = allEvents.filter((e: Event) => e.date === eventDate && e.id !== currentEventId);
                setSameDayEvents(filtered);
            }
        } catch (error) {
            console.error('Error fetching same day events:', error);
        }
    };

    const fetchSimilarEvents = async (eventId: number) => {
        try {
            const response = await fetch(`/api/events/${eventId}/similar`);
            if (response.ok) {
                const data = await response.json();
                setSimilarEvents(data);
            }
        } catch (error) {
            console.error('Error fetching similar events:', error);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen py-8 px-2 bg-light w-full">
                <div className="w-full">
                    <div className="text-center py-12 text-2xl font-bold text-primary animate-pulse">Caricamento evento...</div>
                </div>
            </div>
        );
    }

    if (error || !event) {
        return (
            <div className="min-h-screen py-8 px-2 bg-light w-full">
                <div className="w-full">
                    <div className="text-center py-12 text-2xl font-bold text-red-500">
                        {error || 'Evento non trovato'}
                    </div>
                    <button
                        onClick={() => router.back()}
                        className="mt-4 px-6 py-2 rounded-full font-bold shadow-button bg-linear-to-r from-primary via-accent to-secondary text-white transition-all"
                    >
                        Torna indietro
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen py-8 px-2 bg-light w-full">
            <div className="container mx-auto px-8">
                <div className="w-full space-y-8">
                    {/* Back Button - Fixed position */}
                    <button
                        onClick={() => router.back()}
                        className="mb-6 w-12 h-12 rounded-full bg-white/70 backdrop-blur-sm hover:bg-white/90 shadow-lg flex items-center justify-center transition-all"
                        aria-label="Torna indietro"
                    >
                        <span className="text-2xl">←</span>
                    </button>

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

                                    {/* Edit Button - Float over image if logged in */}
                                    {session && event && params?.slug && (
                                        <button
                                            onClick={() => router.push(`/events/${params.slug}/edit`)}
                                            className="absolute top-6 right-6 z-10 px-4 py-2 rounded-full font-bold shadow-button bg-linear-to-r from-secondary via-accent to-primary text-white hover:shadow-lg transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            ✏️ Modifica
                                        </button>
                                    )}
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
                                            <p className="flex items-center gap-3 text-white"><MapPinIcon className="w-6 h-6 text-primary shrink-0" /> <span>{event.location}</span></p>
                                        </div>
                                        <div className="space-y-4">
                                            {event.category && <p className="flex items-center gap-3 text-white"><span className="text-2xl shrink-0">🏷️</span> <span>{event.category}</span></p>}
                                            {event.organizer && <p className="flex items-center gap-3 text-white"><span className="text-2xl shrink-0">👤</span> <span>{event.organizer}</span></p>}
                                            {event.price && <p className="flex items-center gap-3 text-white"><span className="text-2xl shrink-0">💰</span> <span>{event.price}</span></p>}
                                        </div>
                                    </div>

                                    <div className="border-t border-white/20 pt-6">
                                        <h2 className="text-3xl font-semibold mb-4 bg-gradient-text bg-clip-text text-transparent">Descrizione</h2>
                                        <p className="text-gray-300 whitespace-pre-wrap text-lg leading-relaxed">{event.description}</p>
                                    </div>
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
                                                className="w-full h-32 object-cover rounded-lg mb-3"
                                            />
                                        )}
                                        <h3 className="font-bold text-xl mb-2 text-white group-hover:text-primary transition-colors">{sameDayEvent.title}</h3>
                                        <p className="text-gray-400 text-sm mb-3 line-clamp-2">{sameDayEvent.description}</p>
                                        <div className="space-y-1 text-sm text-gray-400">
                                            <p className="flex items-center gap-2"><ClockIcon className="w-5 h-5 text-primary" /> {sameDayEvent.time}</p>
                                            <p className="flex items-center gap-2"><MapPinIcon className="w-5 h-5 text-primary" /> {sameDayEvent.location}</p>
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
                                                className="w-full h-24 object-cover rounded mb-2"
                                            />
                                        )}
                                        <h3 className="font-semibold text-lg text-white group-hover:text-primary transition-colors">{similarEvent.title}</h3>
                                        <p className="text-gray-400 text-sm">{similarEvent.description.slice(0, 80)}...</p>
                                        <div className="mt-2 text-sm text-gray-400">
                                            <p className="flex items-center gap-2"><CalendarIcon className="w-5 h-5 text-primary" /> {similarEvent.date}</p>
                                            <p className="flex items-center gap-2"><MapPinIcon className="w-5 h-5 text-primary" /> {similarEvent.location}</p>
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