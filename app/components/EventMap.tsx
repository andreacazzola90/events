import { useEffect, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
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

// Component to control map view
function MapController({ center }: { center: [number, number] | null }) {
    const map = useMap();

    useEffect(() => {
        if (center) {
            map.flyTo(center, 14, {
                duration: 1.5
            });
        }
    }, [center, map]);

    return null;
}

export default function EventMap() {
    const [events, setEvents] = useState<EventWithCoordinates[]>([]);
    const [allEvents, setAllEvents] = useState<EventWithCoordinates[]>([]); // Store all events
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
    const [selectedEventId, setSelectedEventId] = useState<number | null>(null);

    // Geographic filter state
    const [filterCity, setFilterCity] = useState('');
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [maxDistance, setMaxDistance] = useState<number | null>(null); // null = show all
    const [isGeolocating, setIsGeolocating] = useState(false);

    useEffect(() => {
        fetchEventsWithCoordinates();
    }, []);

    // Filter events when location or distance changes
    useEffect(() => {
        filterEventsByDistance();
    }, [allEvents, userLocation, maxDistance]);

    // Disable Leaflet keyboard handling for input fields
    useEffect(() => {
        const handleFocus = (e: FocusEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                // Disable Leaflet keyboard handling
                const mapContainer = document.querySelector('.leaflet-container');
                if (mapContainer) {
                    (mapContainer as any)._leaflet_map?.keyboard?.disable();
                }
            }
        };

        const handleBlur = (e: FocusEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                // Re-enable Leaflet keyboard handling
                const mapContainer = document.querySelector('.leaflet-container');
                if (mapContainer) {
                    (mapContainer as any)._leaflet_map?.keyboard?.enable();
                }
            }
        };

        document.addEventListener('focusin', handleFocus);
        document.addEventListener('focusout', handleBlur);

        return () => {
            document.removeEventListener('focusin', handleFocus);
            document.removeEventListener('focusout', handleBlur);
        };
    }, []);

    // Utility: verifica se la stringa sembra un indirizzo
    const isLikelyAddress = (location: string) => {
        if (!location || location.trim().length === 0) return false;

        // Più permissivo: accetta anche nomi di luoghi senza numeri
        // Esempi: "Teatro Comunale", "Piazza Duomo", "Milano"
        const hasLetters = /[a-zA-Z]{3,}/.test(location);
        const hasNumber = /\d+/.test(location);

        // Accetta se ha almeno 3 lettere (nome di luogo)
        return hasLetters;
    };

    const fetchEventsWithCoordinates = async () => {
        try {
            setLoading(true);
            // Fetch events with cache busting
            const timestamp = Date.now();
            const response = await fetch(`/api/events?_t=${timestamp}`, {
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache',
                }
            });
            if (!response.ok) throw new Error('Failed to fetch events');

            const eventsData = await response.json();
            console.log('[EventMap] Fetched events from API:', eventsData.length);
            console.log('[EventMap] Event locations:', eventsData.map((e: EventData) => ({ title: e.title, location: e.location })));

            // Geocode each event location
            const eventsWithCoords = await Promise.all(
                eventsData.map(async (event: EventData) => {
                    if (!isLikelyAddress(event.location)) {
                        // Non tentare la geocodifica, ignora
                        console.log('[EventMap] ❌ Skipping geocoding for:', event.title, '- Invalid location:', event.location);
                        return { ...event };
                    }
                    console.log('[EventMap] 🔍 Attempting geocoding for:', event.title, '- Location:', event.location);
                    const coords = await geocodeLocation(event.location);
                    if (coords.lat && coords.lng) {
                        console.log('[EventMap] ✅ Geocoded:', event.title, '- Coords:', coords);
                    } else {
                        console.log('[EventMap] ⚠️ Geocoding failed for:', event.title, '- Location:', event.location);
                    }
                    return { ...event, ...coords };
                })
            );

            const validEvents = eventsWithCoords.filter(e => e.lat && e.lng);
            console.log('[EventMap] Events with valid coordinates:', validEvents.length, '/', eventsData.length);
            console.log('[EventMap] Valid events:', validEvents.map(e => ({ title: e.title, lat: e.lat, lng: e.lng })));
            console.log('[EventMap] Filtered out events:', eventsWithCoords.filter(e => !e.lat || !e.lng).map(e => ({ title: e.title, location: e.location })));

            // Store all events for filtering
            setAllEvents(validEvents);
            setEvents(validEvents);

            if (validEvents.length > 0) {
                const avgLat = validEvents.reduce((sum, e) => sum + (e.lat || 0), 0) / validEvents.length;
                const avgLng = validEvents.reduce((sum, e) => sum + (e.lng || 0), 0) / validEvents.length;
                setMapCenter([avgLat, avgLng]);
            }

            setLoading(false);
        } catch (err) {
            console.error('Error fetching events:', err);
            setError('Errore nel caricamento degli eventi o nella geocodifica degli indirizzi. Alcuni eventi potrebbero non avere una posizione valida.');
            setLoading(false);
        }
    };

    // Calculate distance between two points using Haversine formula
    const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    // Filter events by distance from user location
    const filterEventsByDistance = () => {
        if (!userLocation || maxDistance === null) {
            // No filter active, show all events
            setEvents(allEvents);
            return;
        }

        const filtered = allEvents.filter(event => {
            if (!event.lat || !event.lng) return false;
            const distance = calculateDistance(userLocation.lat, userLocation.lng, event.lat, event.lng);
            return distance <= maxDistance;
        });

        console.log(`[EventMap] Filtered ${filtered.length}/${allEvents.length} events within ${maxDistance}km`);
        setEvents(filtered);
    };

    // Handle city search
    const handleCitySearch = async () => {
        if (!filterCity.trim()) return;

        setIsGeolocating(true);
        try {
            const coords = await geocodeLocation(filterCity);
            if (coords.lat && coords.lng) {
                setUserLocation({ lat: coords.lat, lng: coords.lng });
                setMapCenter([coords.lat, coords.lng]);
                console.log(`[EventMap] City "${filterCity}" geocoded to:`, coords);
            } else {
                alert('Impossibile trovare la città. Riprova con un nome diverso.');
            }
        } catch (err) {
            console.error('Error geocoding city:', err);
            alert('Errore nella ricerca della città.');
        } finally {
            setIsGeolocating(false);
        }
    };

    // Handle geolocation
    const handleUseMyLocation = () => {
        if (!navigator.geolocation) {
            alert('La geolocalizzazione non è supportata dal tuo browser.');
            return;
        }

        setIsGeolocating(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const location = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                setUserLocation(location);
                setMapCenter([location.lat, location.lng]);
                setFilterCity(''); // Clear city input
                console.log('[EventMap] User location:', location);
                setIsGeolocating(false);
            },
            (error) => {
                console.error('Geolocation error:', error);
                alert('Impossibile ottenere la tua posizione. Assicurati di aver dato il permesso.');
                setIsGeolocating(false);
            }
        );
    };

    // Clear filter
    const handleClearFilter = () => {
        setUserLocation(null);
        setMaxDistance(null);
        setFilterCity('');
        setEvents(allEvents);

        // Reset map center to average of all events
        if (allEvents.length > 0) {
            const avgLat = allEvents.reduce((sum, e) => sum + (e.lat || 0), 0) / allEvents.length;
            const avgLng = allEvents.reduce((sum, e) => sum + (e.lng || 0), 0) / allEvents.length;
            setMapCenter([avgLat, avgLng]);
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
            if (!dateStr) return 'Data non disponibile';

            let date: Date | undefined;

            // Handle DD/MM/YYYY format
            if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                if (parts.length === 3) {
                    const day = parseInt(parts[0]);
                    const month = parseInt(parts[1]) - 1; // Month is 0-indexed
                    const year = parseInt(parts[2]);
                    date = new Date(year, month, day);
                }
            } else {
                // Handle YYYY-MM-DD or other ISO formats
                date = new Date(dateStr);
            }

            // Check if date is valid
            if (!date || isNaN(date.getTime())) {
                return dateStr; // Return original string if parsing failed
            }

            return date.toLocaleDateString('it-IT', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });
        } catch {
            return dateStr;
        }
    };

    const handleEventClick = (event: EventWithCoordinates) => {
        if (event.lat && event.lng) {
            setMapCenter([event.lat, event.lng]);
            setSelectedEventId(event.id);
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

    return (
        <div className="flex flex-col lg:flex-row h-auto lg:h-[700px] rounded-3xl overflow-hidden shadow-2xl border border-white/20 bg-white/10 backdrop-blur-md w-full">
            {/* Map - Top on Mobile, Right on Desktop (3/4 width) */}
            <div className="w-full lg:w-3/4 h-[400px] lg:h-full relative order-1 lg:order-2">
                <MapContainer
                    center={mapCenter || [45.71, 11.35]}
                    zoom={10}
                    style={{ height: '100%', width: '100%' }}
                    className="z-0"
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <MapController center={mapCenter} />
                    {events.map((event) => (
                        event.lat && event.lng && (
                            <Marker
                                key={event.id}
                                position={[event.lat, event.lng]}
                                eventHandlers={{
                                    click: () => setSelectedEventId(event.id),
                                }}
                            >
                                <Popup maxWidth={300}>
                                    <div className="p-2">
                                        {event.imageUrl && (
                                            <img
                                                src={event.imageUrl}
                                                alt={event.title}
                                                className="w-full h-48 object-cover rounded mb-2"
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

            {/* Sidebar - Bottom on Mobile, Left on Desktop (1/4 width) */}
            <div className="w-full lg:w-1/4 h-[400px] lg:h-full bg-white backdrop-blur-lg border-t lg:border-t-0 lg:border-r border-gray-200 overflow-y-auto custom-scrollbar flex-shrink-0 order-2 lg:order-1 relative">
                <div className="p-6 border-b border-gray-100 bg-white sticky top-0 z-20 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2 tracking-tight">
                                <span className="text-blue-600 drop-shadow-sm">📍</span> Eventi
                            </h2>
                            <p className="text-sm font-bold text-gray-400 mt-1 uppercase tracking-widest">
                                {events.length} {userLocation ? `entro ${maxDistance || '∞'}km` : 'risultati'}
                            </p>
                        </div>
                        {userLocation && (
                            <button
                                onClick={handleClearFilter}
                                className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-300 transition-colors"
                                title="Rimuovi filtro"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Geographic Filter */}
                    <div className="space-y-3">
                        <div className="flex gap-2">
                            <button
                                onClick={handleUseMyLocation}
                                disabled={isGeolocating}
                                className="w-10 h-10 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center flex-shrink-0"
                                title="Usa la mia posizione"
                            >
                                {isGeolocating ? '⏳' : '🎯'}
                            </button>
                            <input
                                type="text"
                                placeholder="Cerca città..."
                                value={filterCity}
                                onChange={(e) => setFilterCity(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleCitySearch()}
                                onFocus={(e) => {
                                    // Prevent Leaflet from capturing keyboard events
                                    e.target.setAttribute('data-leaflet-disable-keyboard', 'true');
                                }}
                                onBlur={(e) => {
                                    e.target.removeAttribute('data-leaflet-disable-keyboard');
                                }}
                                className="flex-1 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                disabled={isGeolocating}
                            />
                            <button
                                onClick={handleCitySearch}
                                disabled={isGeolocating || !filterCity.trim()}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                            >
                                🔍
                            </button>
                        </div>

                        {/* Distance Selector */}
                        {userLocation && (
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Distanza massima</label>
                                <div className="grid grid-cols-5 gap-1">
                                    {[10, 25, 50, 100, null].map((distance) => (
                                        <button
                                            key={distance || 'all'}
                                            onClick={() => setMaxDistance(distance)}
                                            className={`px-2 py-1.5 rounded text-xs font-bold transition-colors ${maxDistance === distance
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                        >
                                            {distance ? `${distance}km` : 'Tutti'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="divide-y divide-gray-100">
                    {events.map((event) => (
                        <div
                            key={event.id}
                            onClick={() => handleEventClick(event)}
                            className={`p-6 cursor-pointer transition-all duration-300 hover:bg-blue-50/50 group relative ${selectedEventId === event.id ? 'bg-blue-50/80' : ''}`}
                        >
                            {selectedEventId === event.id && (
                                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-600 rounded-r-full shadow-[0_0_15px_rgba(37,99,235,0.4)]"></div>
                            )}
                            <div className="flex gap-4">
                                {event.imageUrl ? (
                                    <div className="relative flex-shrink-0">
                                        <img
                                            src={event.imageUrl}
                                            alt=""
                                            className="w-20 h-20 rounded-2xl object-cover shadow-lg group-hover:scale-105 transition-transform duration-500"
                                        />
                                    </div>
                                ) : (
                                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center text-3xl shadow-inner border border-gray-200 flex-shrink-0">
                                        📅
                                    </div>
                                )}
                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                    <h3 className="font-bold text-gray-900 leading-tight group-hover:text-blue-600 transition-colors line-clamp-2 text-base">
                                        {event.title}
                                    </h3>
                                    <div className="mt-2 space-y-1.5">
                                        <p className="text-xs font-bold text-blue-600/80 flex items-center gap-2">
                                            <span className="bg-blue-100 p-1 rounded-md text-[10px]">📅</span> {formatDate(event.date)}
                                        </p>
                                        <p className="text-xs font-medium text-gray-500 truncate flex items-center gap-2">
                                            <span className="bg-gray-100 p-1 rounded-md text-[10px]">📍</span> {event.location}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #e2e8f0;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #cbd5e1;
                }
                .leaflet-container {
                    width: 100%;
                    height: 100%;
                }
            `}</style>
        </div>
    );
}
