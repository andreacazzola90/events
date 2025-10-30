'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { EventData } from '@/types/event';

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

export default function EventList() {
    const router = useRouter();
    const [events, setEvents] = useState<Event[]>([]);
    const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const categories = [
        'Musica',
        'Sport',
        'Cultura',
        'Teatro',
        'Cinema',
        'Food & Drink',
        'Feste',
        'Bambini',
        'Workshop',
        'Altro',
    ];
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [showTodayOnly, setShowTodayOnly] = useState(false);

    useEffect(() => {
        fetchEvents();
    }, []);

    useEffect(() => {
        filterEvents();
    }, [events, search, selectedCategories, dateFrom, dateTo]);

    const fetchEvents = async () => {
        try {
            const params = new URLSearchParams();
            if (search) params.append('search', search);
            // rimosso filtro category singolo
            if (dateFrom) params.append('dateFrom', dateFrom);
            if (dateTo) params.append('dateTo', dateTo);

            const response = await fetch(`/api/events?${params.toString()}`);
            if (response.ok) {
                const data = await response.json();
                setEvents(data);
            }
        } catch (error) {
            console.error('Error fetching events:', error);
        } finally {
            setLoading(false);
        }
    };

    const filterEvents = () => {
        let filtered = events;

        if (search) {
            filtered = filtered.filter(event =>
                event.title.toLowerCase().includes(search.toLowerCase()) ||
                event.description.toLowerCase().includes(search.toLowerCase())
            );
        }

        if (selectedCategories.length > 0) {
            filtered = filtered.filter(event => selectedCategories.includes(event.category));
        }

        if (dateFrom) {
            filtered = filtered.filter(event => event.date >= dateFrom);
        }

        if (dateTo) {
            filtered = filtered.filter(event => event.date <= dateTo);
        }

        if (showTodayOnly) {
            const today = new Date();
            const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
            filtered = filtered.filter(event => event.date === todayStr);
        }

        setFilteredEvents(filtered);
    };

    const handleFilterChange = () => {
        fetchEvents();
    };

    if (loading) {
        return <div className="text-center py-8">Caricamento eventi...</div>;
    }

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold text-center">Eventi Salvati</h2>

            {/* Filters */}
            <div className="bg-white p-4 rounded-lg shadow-md space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:gap-4 gap-2">
                    <input
                        type="text"
                        placeholder="Cerca per titolo o descrizione"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="p-2 border rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                        multiple
                        value={selectedCategories}
                        onChange={e => {
                            const options = Array.from(e.target.selectedOptions).map(opt => opt.value);
                            setSelectedCategories(options);
                        }}
                        className="p-2 border rounded focus:ring-2 focus:ring-blue-500 min-h-10"
                    >
                        {categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                    <input
                        type="date"
                        placeholder="Data da"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="p-2 border rounded focus:ring-2 focus:ring-blue-500"
                        disabled={showTodayOnly}
                    />
                    <input
                        type="date"
                        placeholder="Data a"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="p-2 border rounded focus:ring-2 focus:ring-blue-500"
                        disabled={showTodayOnly}
                    />
                    <label className="flex items-center gap-2 text-sm font-medium">
                        <input
                            type="checkbox"
                            checked={showTodayOnly}
                            onChange={e => setShowTodayOnly(e.target.checked)}
                        />
                        Solo eventi di oggi
                    </label>
                </div>
                <button
                    onClick={handleFilterChange}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                    Applica filtri
                </button>
            </div>

            {/* Event List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {filteredEvents.length === 0 ? (
                    <div className="col-span-full text-center py-8 text-gray-500">Nessun evento trovato</div>
                ) : (
                    filteredEvents.map((event) => {
                        // Calcola se evento è passato (gestione robusta date)
                        let isPast = false;
                        if (event.date) {
                            const [day, month, year] = event.date.split('/');
                            if (day && month && year) {
                                const eventDate = new Date(`${year.padStart(4, '20')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
                                const now = new Date();
                                // Solo data, ignora orario
                                isPast = eventDate < new Date(now.getFullYear(), now.getMonth(), now.getDate());
                            }
                        }
                        return (
                            <div
                                key={event.id}
                                className={`bg-white p-4 rounded-lg shadow-md cursor-pointer hover:shadow-lg transition-shadow ${isPast ? 'opacity-60 grayscale' : ''}`}
                                onClick={() => router.push(`/events/${event.id}`)}
                            >
                                {event.imageUrl && (
                                    <img
                                        src={event.imageUrl.startsWith('/uploads/') ? event.imageUrl : event.imageUrl}
                                        alt={event.title}
                                        className="w-full h-32 object-cover rounded mb-4"
                                    />
                                )}
                                <div>
                                    <h3 className="text-xl font-semibold">{event.title}</h3>
                                    <p className="text-gray-600">{event.description.slice(0, 100)}...</p>
                                    <div className="mt-2 space-y-1 text-sm text-gray-500">
                                        <p>Data: {event.date}</p>
                                        <p>Ora: {event.time}</p>
                                        <p>Luogo: {event.location}</p>
                                        {event.category && <p>Categoria: {event.category}</p>}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

        </div>
    );
}