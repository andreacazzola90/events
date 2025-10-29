'use client';

import { useState, useEffect } from 'react';
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
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (params.id) {
            fetchEvent();
            fetchSimilarEvents();
        }
    }, [params.id]);

    const fetchEvent = async () => {
        try {
            const response = await fetch(`/api/events/${params.id}`);
            if (response.ok) {
                const data = await response.json();
                setEvent(data);
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

    const fetchSimilarEvents = async () => {
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
            <div className="min-h-screen p-8">
                <div className="max-w-4xl mx-auto">
                    <div className="text-center py-8">Caricamento evento...</div>
                </div>
            </div>
        );
    }

    if (error || !event) {
        return (
            <div className="min-h-screen p-8">
                <div className="max-w-4xl mx-auto">
                    <div className="text-center py-8 text-red-600">
                        {error || 'Evento non trovato'}
                    </div>
                    <button
                        onClick={() => router.back()}
                        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        Torna indietro
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-8">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Back Button */}
                <button
                    onClick={() => router.back()}
                    className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                >
                    ← Torna indietro
                </button>

                {/* Event Details */}
                <div className="bg-white rounded-lg shadow-lg p-6">
                    {event.imageUrl && (
                        <img
                            src={event.imageUrl.startsWith('/uploads/') ? event.imageUrl : event.imageUrl}
                            alt={event.title}
                            className="w-full h-64 object-cover rounded-lg mb-6"
                        />
                    )}

                    <div className="space-y-4">
                        <h1 className="text-4xl font-bold">{event.title}</h1>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-lg">
                            <div>
                                <p><strong>Data:</strong> {event.date}</p>
                                <p><strong>Ora:</strong> {event.time}</p>
                                <p><strong>Luogo:</strong> {event.location}</p>
                            </div>
                            <div>
                                {event.category && <p><strong>Categoria:</strong> {event.category}</p>}
                                {event.organizer && <p><strong>Organizzatore:</strong> {event.organizer}</p>}
                                {event.price && <p><strong>Prezzo:</strong> {event.price}</p>}
                            </div>
                        </div>

                        <div className="border-t pt-4">
                            <h2 className="text-2xl font-semibold mb-2">Descrizione</h2>
                            <p className="text-gray-700 whitespace-pre-wrap">{event.description}</p>
                        </div>

                        {event.rawText && (
                            <div className="border-t pt-4">
                                <h2 className="text-2xl font-semibold mb-2">Testo Originale</h2>
                                <p className="text-gray-600 whitespace-pre-wrap text-sm">{event.rawText}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Similar Events */}
                {similarEvents.length > 0 && (
                    <div className="bg-white rounded-lg shadow-lg p-6">
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
                                        <p>Data: {similarEvent.date}</p>
                                        <p>Luogo: {similarEvent.location}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}