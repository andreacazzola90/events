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
    const [category, setCategory] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [onlyToday, setOnlyToday] = useState(false);

    useEffect(() => {
        fetchEvents();
    }, []);

    useEffect(() => {
        filterEvents();
    }, [events, search, category, dateFrom, dateTo, onlyToday]);

    const fetchEvents = async () => {
        try {
            const params = new URLSearchParams();
            if (search) params.append('search', search);
            if (category) params.append('category', category);
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

        if (category) {
            filtered = filtered.filter(event => event.category === category);
        }

        if (onlyToday) {
            const today = new Date().toISOString().slice(0, 10);
            filtered = filtered.filter(event => event.date === today);
        } else {
            if (dateFrom) {
                filtered = filtered.filter(event => event.date >= dateFrom);
            }
            if (dateTo) {
                filtered = filtered.filter(event => event.date <= dateTo);
            }
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
        <div className="space-y-12">
            {/* Filters */}
            <div className="bg-white p-8 rounded-xl shadow-md border border-gray-200">
                <form
                    className="flex flex-col md:flex-row md:items-end gap-4 md:gap-6 w-full"
                    onSubmit={e => { e.preventDefault(); handleFilterChange(); }}
                >
                    <input
                        type="text"
                        placeholder="Cerca per titolo o descrizione"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="p-2 border rounded focus:ring-2 focus:ring-blue-500 w-full md:w-56"
                    />
                    <input
                        type="text"
                        placeholder="Categoria"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="p-2 border rounded focus:ring-2 focus:ring-blue-500 w-full md:w-40"
                    />
                    <input
                        type="date"
                        placeholder="Data da"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="p-2 border rounded focus:ring-2 focus:ring-blue-500 w-full md:w-40"
                        disabled={onlyToday}
                    />
                    <input
                        type="date"
                        placeholder="Data a"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="p-2 border rounded focus:ring-2 focus:ring-blue-500 w-full md:w-40"
                        disabled={onlyToday}
                    />
                    <label className="flex items-center gap-2 text-base font-medium whitespace-nowrap select-none">
                        <input
                            type="checkbox"
                            checked={onlyToday}
                            onChange={e => setOnlyToday(e.target.checked)}
                            className="accent-blue-600 w-5 h-5"
                        />
                        Solo oggi
                    </label>
                    <button
                        type="submit"
                        className="px-4 py-2 rounded-full font-bold shadow-button bg-linear-to-r from-primary via-accent to-secondary hover:from-pink-600 hover:to-yellow-400 text-white transition-all"
                    >
                        Applica filtri
                    </button>
                </form>
            </div>

            {/* Event List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mt-8">
                {filteredEvents.length === 0 ? (
                    <div className="col-span-full text-center py-8 text-gray-500">Nessun evento trovato</div>
                ) : (
                    filteredEvents.map((event) => (
                        <div
                            key={event.id}
                            className="bg-white p-8 rounded-2xl shadow-md border border-gray-200 cursor-pointer hover:shadow-lg transition-shadow flex flex-col gap-6 min-h-80"
                            onClick={() => router.push(`/events/${event.id}`)}
                        >
                            {event.imageUrl && (
                                <img
                                    src={event.imageUrl.startsWith('/uploads/') ? event.imageUrl : event.imageUrl}
                                    alt={event.title}
                                    className="w-full h-40 object-cover rounded-xl mb-4"
                                />
                            )}
                            <div className="flex flex-col gap-3 flex-1">
                                <h3 className="text-2xl font-bold leading-tight">{event.title}</h3>
                                <p className="text-gray-700 text-lg">{event.description.slice(0, 100)}...</p>
                                <div className="mt-2 space-y-2 text-base text-gray-500">
                                    <p className="flex items-center gap-2">📅 {event.date}</p>
                                    <p className="flex items-center gap-2">🕐 {event.time}</p>
                                    <p className="flex items-center gap-2">📍 {event.location}</p>
                                    {event.category && <p className="flex items-center gap-2">🏷️ {event.category}</p>}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

        </div>
    );
}