'use client';

import { useState, useEffect } from 'react';
import { CalendarIcon, ClockIcon, MapPinIcon } from '../../components/EventIcons';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';

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
        if (params && params.id) {
            fetchEvent();
            fetchSimilarEvents();
        }
    }, [params?.id]);

    const fetchEvent = async () => {
        if (!params || !params.id) return;
        try {
            const response = await fetch(`/api/events/${params.id}`);
            if (response.ok) {
                const data = await response.json();
                setEvent(data);
                // Fetch eventi dello stesso giorno
                fetchSameDayEvents(data.date);
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

    const fetchSameDayEvents = async (eventDate: string) => {
        try {
            const response = await fetch(`/api/events`);
            if (response.ok) {
                const allEvents = await response.json();
                const filtered = allEvents.filter((e: Event) => e.date === eventDate && e.id !== Number(params?.id));
                setSameDayEvents(filtered);
            }
        } catch (error) {
            console.error('Error fetching same day events:', error);
        }
    };

    const fetchSimilarEvents = async () => {
        if (!params || !params.id) return;
        try {
            const response = await fetch(`/api/events/${params.id}/similar`);
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
                    {/* Event Details */}
                    <div className="card w-full max-w-full relative">
                        {/* Back Button - Float over image */}
                        <button
                            onClick={() => router.back()}
                            className="absolute top-6 left-6 z-10 w-12 h-12 rounded-full bg-white/70 backdrop-blur-sm hover:bg-white/90 shadow-lg flex items-center justify-center transition-all"
                            aria-label="Torna indietro"
                        >
                            <span className="text-2xl">←</span>
                        </button>

                        {/* Edit Button - Float over image if logged in */}
                        {session && event && (
                            <button
                                onClick={() => router.push(`/events/${event.id}/edit`)}
                                className="absolute top-6 right-6 z-10 px-4 py-2 rounded-full font-bold shadow-button bg-linear-to-r from-secondary via-accent to-primary text-white hover:shadow-lg transition-all"
                            >
                                ✏️ Modifica
                            </button>
                        )}

                        {event.imageUrl && (
                            <img
                                src={event.imageUrl.startsWith('/uploads/') ? event.imageUrl : event.imageUrl}
                                alt={event.title}
                                className="w-full h-96 md:h-[500px] lg:h-[600px] object-cover rounded-xl mb-8"
                            />
                        )}

                        <div className="space-y-6">
                            <h1 className="text-4xl md:text-5xl font-bold">{event.title}</h1>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-lg">
                                <div className="space-y-3">
                                    <p className="flex items-center gap-3"><CalendarIcon className="w-6 h-6 text-blue-500" /> <span>{event.date}</span></p>
                                    <p className="flex items-center gap-3"><ClockIcon className="w-6 h-6 text-blue-500" /> <span>{event.time}</span></p>
                                    <p className="flex items-center gap-3"><MapPinIcon className="w-6 h-6 text-blue-500" /> <span>{event.location}</span></p>
                                </div>
                                <div className="space-y-3">
                                    {event.category && <p className="flex items-center gap-3"><span className="text-2xl">🏷️</span> <span>{event.category}</span></p>}
                                    {event.organizer && <p className="flex items-center gap-3"><span className="text-2xl">👤</span> <span>{event.organizer}</span></p>}
                                    {event.price && <p className="flex items-center gap-3"><span className="text-2xl">💰</span> <span>{event.price}</span></p>}
                                </div>
                            </div>

                            <div className="border-t pt-6">
                                <h2 className="text-3xl font-semibold mb-4">Descrizione</h2>
                                <p className="text-gray-700 whitespace-pre-wrap text-lg leading-relaxed">{event.description}</p>
                            </div>
                        </div>
                    </div>

                    {/* Same Day Events */}
                    {sameDayEvents.length > 0 && (
                        <div className="bg-white rounded-2xl shadow-card p-8 w-full max-w-full">
                            <h2 className="text-3xl font-bold text-primary mb-6">Altri Eventi dello Stesso Giorno</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {sameDayEvents.map((sameDayEvent) => (
                                    <div
                                        key={sameDayEvent.id}
                                        className="bg-gray-50 p-6 rounded-xl cursor-pointer hover:shadow-lg transition-shadow border border-gray-200"
                                        onClick={() => router.push(`/events/${sameDayEvent.id}`)}
                                    >
                                        {sameDayEvent.imageUrl && (
                                            <img
                                                src={sameDayEvent.imageUrl.startsWith('/uploads/') ? sameDayEvent.imageUrl : sameDayEvent.imageUrl}
                                                alt={sameDayEvent.title}
                                                className="w-full h-32 object-cover rounded-lg mb-3"
                                            />
                                        )}
                                        <h3 className="font-bold text-xl mb-2">{sameDayEvent.title}</h3>
                                        <p className="text-gray-600 text-sm mb-3 line-clamp-2">{sameDayEvent.description}</p>
                                        <div className="space-y-1 text-sm text-gray-500">
                                            <p className="flex items-center gap-2"><ClockIcon className="w-5 h-5 text-blue-500" /> {sameDayEvent.time}</p>
                                            <p className="flex items-center gap-2"><MapPinIcon className="w-5 h-5 text-blue-500" /> {sameDayEvent.location}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Similar Events */}
                    {similarEvents.length > 0 && (
                        <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-full">
                            <h2 className="text-3xl font-bold mb-6">Eventi Simili</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {similarEvents.map((similarEvent) => (
                                    <div
                                        key={similarEvent.id}
                                        className="bg-gray-50 p-4 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                                        onClick={() => router.push(`/events/${similarEvent.id}`)}
                                    >
                                        {similarEvent.imageUrl && (
                                            <img
                                                src={similarEvent.imageUrl.startsWith('/uploads/') ? similarEvent.imageUrl : similarEvent.imageUrl}
                                                alt={similarEvent.title}
                                                className="w-full h-24 object-cover rounded mb-2"
                                            />
                                        )}
                                        <h3 className="font-semibold text-lg">{similarEvent.title}</h3>
                                        <p className="text-gray-600 text-sm">{similarEvent.description.slice(0, 80)}...</p>
                                        <div className="mt-2 text-sm text-gray-500">
                                            <p className="flex items-center gap-2"><CalendarIcon className="w-5 h-5 text-blue-500" /> {similarEvent.date}</p>
                                            <p className="flex items-center gap-2"><MapPinIcon className="w-5 h-5 text-blue-500" /> {similarEvent.location}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}