'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { EventData } from '@/types/event';
import { generateUniqueSlug } from '../../lib/slug-utils';
import { TransitionLink } from './TransitionLink';
import { trackSearch, trackGTMEvent } from '../lib/gtm';
import { trackEvent } from '../lib/analytics';
import { STANDARD_CATEGORIES } from '../../lib/constants';

// Funzione per pulire il testo da caratteri strani
function cleanText(text: string): string {
    if (!text) return '';
    return text
        // Rimuove caratteri di controllo e non stampabili
        .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
        // Sostituisce caratteri di encoding problematici
        .replace(/â€™/g, "'")
        .replace(/â€œ/g, '"')
        .replace(/â€/g, '"')
        .replace(/â€"/g, '—')
        .replace(/Ã /g, 'à')
        .replace(/Ã¨/g, 'è')
        .replace(/Ã©/g, 'é')
        .replace(/Ã¬/g, 'ì')
        .replace(/Ã²/g, 'ò')
        .replace(/Ã¹/g, 'ù')
        // Normalizza spazi multipli
        .replace(/\s+/g, ' ')
        .trim();
}

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

        // Re-fetch when page becomes visible (after navigation)
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                console.log('[EventList] Page visible, re-fetching events');
                fetchEvents();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Also re-fetch when window regains focus
        const handleFocus = () => {
            console.log('[EventList] Window focused, re-fetching events');
            fetchEvents();
        };

        window.addEventListener('focus', handleFocus);

        // Listen for URL changes (for refresh parameter)
        const handleUrlChange = () => {
            const refresh = new URLSearchParams(window.location.search).get('refresh');
            if (refresh) {
                console.log('[EventList] Refresh parameter detected, re-fetching events');
                fetchEvents();
                // Clean up the URL parameter
                window.history.replaceState({}, '', '/');
            }
        };

        // Check on mount
        handleUrlChange();

        // Listen for popstate (back/forward navigation)
        window.addEventListener('popstate', handleUrlChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('popstate', handleUrlChange);
        };
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

            console.log('[EventList] Fetching events from API...');
            const response = await fetch(`/api/events?${params.toString()}`);
            if (response.ok) {
                const data = await response.json();
                console.log('[EventList] Fetched events:', data.length, 'First event:', data[0]?.title, data[0]?.id);
                setEvents(data);
            } else {
                console.error('[EventList] Failed to fetch events:', response.status);
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

            // Track search
            trackSearch(search, category, filtered.length);
            trackEvent('search', 'Events', search, filtered.length);
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
        <div className="space-y-8">
            {/* Filters - Dice.fm Style */}
            <div className="glass-effect p-6 rounded-2xl border border-white/10">
                <form
                    className="flex flex-col lg:flex-row gap-4 items-center"
                    onSubmit={e => { e.preventDefault(); handleFilterChange(); }}
                >
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <input
                            type="text"
                            placeholder="Search events..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:bg-white/20 transition-all"
                        />
                        <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:bg-white/20 transition-all appearance-none"
                        >
                            <option value="" className="bg-gray-900 text-white">Tutte le Categorie</option>
                            {STANDARD_CATEGORIES.map(cat => (
                                <option key={cat} value={cat} className="bg-gray-900 text-white">
                                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                                </option>
                            ))}
                        </select>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:bg-white/20 transition-all"
                            disabled={onlyToday}
                        />
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:bg-white/20 transition-all"
                            disabled={onlyToday}
                        />
                    </div>

                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-white font-medium cursor-pointer">
                            <input
                                type="checkbox"
                                checked={onlyToday}
                                onChange={e => setOnlyToday(e.target.checked)}
                                className="w-4 h-4 text-pink-500 bg-white/10 border-white/20 rounded focus:ring-pink-500 focus:ring-2"
                            />
                            Today only
                        </label>
                        <button
                            type="submit"
                            className="bg-linear-to-r from-pink-500 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-pink-500/25"
                        >
                            Filter
                        </button>
                    </div>
                </form>
            </div>

            {/* Event Grid - Dice.fm Style */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredEvents.length === 0 ? (
                    <div className="col-span-full text-center py-16">
                        <div className="text-6xl mb-4">🎵</div>
                        <h3 className="text-2xl font-bold text-white mb-2">No events found</h3>
                        <p className="text-gray-400">Try adjusting your search filters or create a new event</p>
                    </div>
                ) : (
                    filteredEvents.map((event) => (
                        <TransitionLink
                            key={event.id}
                            href={`/events/${generateUniqueSlug(event.title, event.id)}`}
                            className="event-card cursor-pointer group block no-underline"
                        >
                            {/* Event Image */}
                            <div className="relative overflow-hidden">
                                {event.imageUrl ? (
                                    <img
                                        src={event.imageUrl.startsWith('/uploads/') ? event.imageUrl : event.imageUrl}
                                        alt={event.title}
                                        className="w-full h-48 object-cover transition-transform duration-300 group-hover:scale-110"
                                    />
                                ) : (
                                    <div className="w-full h-48 bg-linear-to-br from-pink-500/20 to-purple-600/20 flex items-center justify-center">
                                        <div className="text-4xl opacity-50">🎵</div>
                                    </div>
                                )}

                                {/* Price Badge */}
                                {event.price && (
                                    <div className="absolute top-3 right-3 bg-black/80 text-white px-2 py-1 rounded-lg text-sm font-semibold">
                                        {event.price}
                                    </div>
                                )}
                            </div>

                            {/* Event Details */}
                            <div className="p-5 space-y-3">
                                <div className="space-y-2">
                                    <h3 className="text-xl font-bold text-white leading-tight line-clamp-2 transition-colors">
                                        {cleanText(event.title)}
                                    </h3>
                                    <p className="text-gray-400 text-sm line-clamp-2">
                                        {cleanText(event.description)}
                                    </p>
                                </div>

                                <div className="space-y-1 text-sm">
                                    <div className="flex items-center gap-2 text-gray-300">
                                        <span className="w-4">📅</span>
                                        <span>{(() => {
                                            // Gestisce sia formato YYYY-MM-DD che DD/MM/YYYY
                                            let dateObj: Date;
                                            if (event.date.includes('/')) {
                                                // Formato DD/MM/YYYY
                                                const [day, month, year] = event.date.split('/');
                                                dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                                            } else {
                                                // Formato YYYY-MM-DD
                                                dateObj = new Date(event.date);
                                            }
                                            return dateObj.toLocaleDateString('it-IT', {
                                                weekday: 'short',
                                                day: 'numeric',
                                                month: 'short'
                                            });
                                        })()}</span>
                                        {event.time && <span className="text-gray-500">• {event.time}</span>}
                                    </div>

                                    {event.location && (
                                        <div className="flex items-center gap-2 text-gray-300">
                                            <span className="w-4 shrink-0">📍</span>
                                            <span className="truncate">{event.location}</span>
                                        </div>
                                    )}

                                    {event.organizer && (
                                        <div className="flex items-center gap-2 text-gray-300">
                                            <span className="w-4 shrink-0">👤</span>
                                            <span className="truncate">{event.organizer}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Category Badge */}
                                {event.category && (
                                    <div className="pt-2">
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-pink-500/20 text-pink-300 border border-pink-500/30">
                                            {event.category}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </TransitionLink>
                    ))
                )}
            </div>
        </div>
    );
}