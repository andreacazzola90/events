'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet with Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface EventData {
    id: number;
    title: string;
    description: string;
    date: string;
    time: string;
    location: string;
    organizer: string;
    category: string;
    price: string;
    imageUrl?: string;
    sourceUrl?: string;
}

interface EventWithCoordinates extends EventData {
    lat?: number;
    lng?: number;
}

export default function EventMap() {
    const [events, setEvents] = useState<EventWithCoordinates[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchEventsWithCoordinates();
    }, []);

    // Utility: verifica se la stringa sembra un indirizzo
    const isLikelyAddress = (location: string) => {
        // Semplice euristica: contiene almeno un numero e una via o città
        return /\d+/.test(location) && /[a-zA-Z]{3,}/.test(location);
    };

    const fetchEventsWithCoordinates = async () => {
        try {
            setLoading(true);
            // Add cache-busting timestamp
            const response = await fetch(`/api/events?_t=${Date.now()}`, {
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                },
            });
            if (!response.ok) throw new Error('Failed to fetch events');

            const eventsData = await response.json();
            console.log('[EventMap] Fetched events:', eventsData.length);

            // Geocode each event location SOLO se sembra un indirizzo
            const eventsWithCoords = await Promise.all(
                eventsData.map(async (event: EventData) => {
                    if (!isLikelyAddress(event.location)) {
                        // Non tentare la geocodifica, ignora
                        console.log('[EventMap] Skipping geocoding for:', event.location);
                        return { ...event };
                    }
                    const coords = await geocodeLocation(event.location);
                    return { ...event, ...coords };
                })
            );

            const validEvents = eventsWithCoords.filter(e => e.lat && e.lng);
            console.log('[EventMap] Events with valid coordinates:', validEvents.length);
            setEvents(validEvents);
            setLoading(false);
        } catch (err) {
            console.error('Error fetching events:', err);
            setError('Errore nel caricamento degli eventi o nella geocodifica degli indirizzi. Alcuni eventi potrebbero non avere una posizione valida.');
            setLoading(false);
        }
    };

    // Cache in-memory per la geocodifica
    const geocodeCache: Record<string, { lat: number; lng: number }> = {};

    const geocodeLocation = async (location: string): Promise<{ lat?: number; lng?: number }> => {
        if (geocodeCache[location]) {
            return geocodeCache[location];
        }
        try {
            // Using Nominatim (OpenStreetMap) for geocoding
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`,
                {
                    headers: {
                        'User-Agent': 'EventScanner/1.0'
                    }
                }
            );

            if (!response.ok) return {};

            const data = await response.json();
            if (data.length > 0) {
                const coords = {
                    lat: parseFloat(data[0].lat),
                    lng: parseFloat(data[0].lon)
                };
                geocodeCache[location] = coords;
                return coords;
            }
            return {};
        } catch (err) {
            // Silenzia l'errore: non mostrare nulla in console, ignora l'evento
            return {};
        }
    };

    const formatDate = (dateStr: string) => {
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
        } catch {
            return dateStr;
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[600px] bg-gray-100 rounded-lg">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Caricamento mappa...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-[600px] bg-red-50 rounded-lg">
                <div className="text-center">
                    <p className="text-red-600">{error}</p>
                </div>
            </div>
        );
    }

    if (events.length === 0) {
        return (
            <div className="flex items-center justify-center h-[600px] bg-gray-100 rounded-lg">
                <div className="text-center">
                    <p className="text-gray-600">Nessun evento da visualizzare sulla mappa</p>
                </div>
            </div>
        );
    }

    // Calculate center of all events
    const avgLat = events.reduce((sum, e) => sum + (e.lat || 0), 0) / events.length;
    const avgLng = events.reduce((sum, e) => sum + (e.lng || 0), 0) / events.length;

    return (
        <div className="rounded-lg overflow-hidden shadow-lg">
            <MapContainer
                center={[avgLat, avgLng]}
                zoom={10}
                style={{ height: '600px', width: '100%' }}
                className="z-0"
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {events.map((event) => (
                    event.lat && event.lng && (
                        <Marker key={event.id} position={[event.lat, event.lng]}>
                            <Popup maxWidth={300}>
                                <div className="p-2">
                                    {event.imageUrl && (
                                        <img
                                            src={event.imageUrl}
                                            alt={event.title}
                                            className="w-full h-32 object-cover rounded mb-2"
                                        />
                                    )}
                                    <h3 className="font-bold text-lg mb-1">{event.title}</h3>
                                    <p className="text-sm text-gray-600 mb-2">{event.description}</p>
                                    <div className="space-y-1 text-sm">
                                        <p><strong>📅 Data:</strong> {formatDate(event.date)}</p>
                                        <p><strong>🕐 Ora:</strong> {event.time}</p>
                                        <p><strong>📍 Luogo:</strong> {event.location}</p>
                                        <p><strong>🎫 Prezzo:</strong> {event.price}</p>
                                        <p><strong>🏷️ Categoria:</strong> {event.category}</p>
                                    </div>
                                    <a
                                        href={`/events/${event.id}`}
                                        className="mt-3 block text-center bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                                    >
                                        Vedi Dettagli
                                    </a>
                                </div>
                            </Popup>
                        </Marker>
                    )
                ))}
            </MapContainer>
        </div>
    );
}
