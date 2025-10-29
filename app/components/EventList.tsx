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

    useEffect(() => {
        fetchEvents();
    }, []);

    useEffect(() => {
        filterEvents();
    }, [events, search, category, dateFrom, dateTo]);

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

        if (dateFrom) {
            filtered = filtered.filter(event => event.date >= dateFrom);
        }

        if (dateTo) {
            filtered = filtered.filter(event => event.date <= dateTo);
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
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <input
                        type="text"
                        placeholder="Cerca per titolo o descrizione"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="p-2 border rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                        type="text"
                        placeholder="Categoria"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="p-2 border rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                        type="date"
                        placeholder="Data da"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="p-2 border rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                        type="date"
                        placeholder="Data a"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="p-2 border rounded focus:ring-2 focus:ring-blue-500"
                    />
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
                    filteredEvents.map((event) => (
                        <div
                            key={event.id}
                            className="bg-white p-4 rounded-lg shadow-md cursor-pointer hover:shadow-lg transition-shadow"
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
                    ))
                )}
            </div>

        </div>
    );
}