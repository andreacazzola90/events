'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { generateUniqueSlug } from '../../lib/slug-utils';
import { TransitionLink } from './TransitionLink';
import { trackSearch } from '../lib/gtm';
import { trackEvent } from '../lib/analytics';
import { STANDARD_CATEGORIES } from '../../lib/constants';
import FavoriteButton from './FavoriteButton';

type EventListMode = 'full' | 'quick';
type QuickDateFilter = 'today' | 'tomorrow' | 'weekend' | 'week';

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

type PriceLabel = 'gratis' | 'pagamento' | 'non definito';

// Normalizza il prezzo in tre etichette: gratis / pagamento / non definito
function getPriceLabel(rawPrice: string | null | undefined): PriceLabel {
    if (!rawPrice) return 'non definito';

    const price = rawPrice.toLowerCase();

    // Casi gratuiti espliciti
    if (
        price.includes('gratis') ||
        price.includes('ingresso libero') ||
        price.includes('ingresso gratuito') ||
        price.includes('ingresso libero') ||
        price.includes('free')
    ) {
        return 'gratis';
    }

    // Il valore di default usato dall'estrazione quando non trova info
    if (price.includes('non definito')) {
        return 'non definito';
    }

    // Se troviamo numeri/euro o riferimenti a biglietti/pagamento, consideriamo "pagamento"
    if (
        /\d/.test(price) ||
        price.includes('€') ||
        price.includes('euro') ||
        price.includes('bigliett') ||
        price.includes('prevendita') ||
        price.includes('ticket') ||
        price.includes('vivaticket') ||
        price.includes('ticketone')
    ) {
        return 'pagamento';
    }

    return 'non definito';
}

function getPriceBadgeClasses(label: PriceLabel): string {
    switch (label) {
        case 'gratis':
            return 'bg-emerald-500/95 text-white shadow-emerald-500/40';
        case 'pagamento':
            return 'bg-pink-500/95 text-white shadow-pink-500/40';
        case 'non definito':
        default:
            return 'bg-slate-500/80 text-white shadow-slate-500/30';
    }
}

// Mappa categoria → classi colore del badge (bg + shadow)
function getCategoryBadgeClasses(rawCategory: string): string {
    const cat = rawCategory.toLowerCase();

    switch (cat) {
        case 'musica':
        case 'music':
            return 'bg-blue-500/90 shadow-blue-500/40';
        case 'nightlife':
            return 'bg-fuchsia-500/90 shadow-fuchsia-500/40';
        case 'cultura':
        case 'culture':
            return 'bg-emerald-500/90 shadow-emerald-500/40';
        case 'cibo':
        case 'food':
            return 'bg-amber-500/90 shadow-amber-500/40';
        case 'sport':
            return 'bg-lime-500/90 shadow-lime-500/40';
        case 'famiglia':
        case 'family':
            return 'bg-sky-500/90 shadow-sky-500/40';
        case 'teatro':
        case 'theater':
            return 'bg-indigo-500/90 shadow-indigo-500/40';
        case 'festa':
        case 'party':
            return 'bg-rose-500/90 shadow-rose-500/40';
        case 'passeggiata':
        case 'walk':
            return 'bg-green-500/90 shadow-green-500/40';
        default:
            return 'bg-slate-500/90 shadow-slate-500/40';
    }
}

function parseEventDate(value: string): Date | null {
    if (!value) return null;

    if (value.includes('/')) {
        const [day, month, year] = value.split('/').map(part => parseInt(part, 10));
        if (!day || !month || !year) return null;
        const parsed = new Date(year, month - 1, day);
        parsed.setHours(0, 0, 0, 0);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    parsed.setHours(0, 0, 0, 0);
    return parsed;
}

function getQuickRange(filter: QuickDateFilter): { start: Date; end: Date } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (filter === 'today') {
        return { start: today, end: today };
    }

    if (filter === 'tomorrow') {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return { start: tomorrow, end: tomorrow };
    }

    if (filter === 'week') {
        const weekEnd = new Date(today);
        weekEnd.setDate(weekEnd.getDate() + 6);
        return { start: today, end: weekEnd };
    }

    const day = today.getDay();
    let start = new Date(today);

    if (day === 6) {
        start = today;
    } else if (day === 0) {
        start = today;
    } else {
        start.setDate(today.getDate() + (6 - day));
    }

    const end = new Date(start);
    if (start.getDay() === 6) {
        end.setDate(start.getDate() + 1);
    }

    return { start, end };
}

function isDateInRange(date: Date, start: Date, end: Date): boolean {
    return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

export default function EventList({ mode = 'full' }: { mode?: EventListMode }) {
    const [events, setEvents] = useState<Event[]>([]);
    const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [onlyToday, setOnlyToday] = useState(false);
    const [locationFilter, setLocationFilter] = useState('');
    const [organizerFilter, setOrganizerFilter] = useState('');
    const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
    const [quickDateFilter, setQuickDateFilter] = useState<QuickDateFilter>('today');
    const [visibleCount, setVisibleCount] = useState(4);

    useEffect(() => {
        fetchEvents();

        // Carica i preferiti iniziali per l'utente loggato (se presente)
        const fetchFavorites = async () => {
            try {
                const res = await fetch('/api/favorites', { cache: 'no-store' });
                if (!res.ok) return;
                const data: { id: number }[] = await res.json();
                setFavoriteIds(new Set(data.map(e => e.id)));
            } catch {
                // Ignora errori: per utenti non loggati / problemi di rete
            }
        };

        fetchFavorites();

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
    }, [events, search, category, dateFrom, dateTo, onlyToday, locationFilter, organizerFilter, quickDateFilter, mode]);

    useEffect(() => {
        if (mode === 'quick') {
            setVisibleCount(4);
        }
    }, [quickDateFilter, mode]);

    const fetchEvents = async () => {
        try {
            const params = new URLSearchParams();
            // Prendi un set sufficientemente ampio di eventi, il filtraggio avviene lato client
            params.append('limit', '200');
            params.append('_t', Date.now().toString());

            console.log('[EventList] Fetching events from API...');
            const response = await fetch(`/api/events?${params.toString()}`, { cache: 'no-store' });
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
        if (mode === 'quick') {
            const { start, end } = getQuickRange(quickDateFilter);
            const quickFiltered = events
                .filter((event) => {
                    const parsedDate = parseEventDate(event.date);
                    if (!parsedDate) return false;
                    return isDateInRange(parsedDate, start, end);
                })
                .sort((a, b) => {
                    const firstDate = parseEventDate(a.date)?.getTime() || 0;
                    const secondDate = parseEventDate(b.date)?.getTime() || 0;
                    if (firstDate === secondDate) {
                        return a.id - b.id;
                    }
                    return firstDate - secondDate;
                });

            setFilteredEvents(quickFiltered);
            return;
        }

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

        if (locationFilter) {
            const needle = locationFilter.toLowerCase();
            filtered = filtered.filter(event =>
                (event.location || '').toLowerCase().includes(needle)
            );
        }

        if (organizerFilter) {
            const needle = organizerFilter.toLowerCase();
            filtered = filtered.filter(event =>
                (event.organizer || '').toLowerCase().includes(needle)
            );
        }

        setFilteredEvents(filtered);
    };

    const [filtersOpen, setFiltersOpen] = useState(false);

    const handleFavoriteToggleLocal = (eventId: number, newValue: boolean) => {
        setFavoriteIds(prev => {
            const next = new Set(prev);
            if (newValue) {
                next.add(eventId);
            } else {
                next.delete(eventId);
            }
            return next;
        });
    };

    if (loading) {
        return <div className="text-center py-8">Caricamento eventi...</div>;
    }

    return (
        <div className="space-y-8">
            {mode === 'quick' ? (
                <div className="glass-effect rounded-2xl border border-white/10 p-4 sm:p-6">
                    <div className="flex gap-3 overflow-x-auto pb-1">
                        {[
                            { value: 'today' as const, label: 'oggi' },
                            { value: 'tomorrow' as const, label: 'domani' },
                            { value: 'weekend' as const, label: 'this weekend' },
                            { value: 'week' as const, label: 'this week' },
                        ].map((option) => (
                            <button
                                key={option.value}
                                onClick={() => setQuickDateFilter(option.value)}
                                className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold border transition-all ${quickDateFilter === option.value
                                        ? 'bg-white text-black border-white'
                                        : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                                    }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="glass-effect rounded-2xl border border-white/10 overflow-hidden">
                    {/* Mobile Filter Toggle */}
                    <button
                        onClick={() => setFiltersOpen(!filtersOpen)}
                        className="w-full lg:hidden flex items-center justify-between p-6 text-white font-bold"
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-xl">🔍</span>
                            <span>Filtra Eventi</span>
                        </div>
                        <span className={`transition-transform duration-300 ${filtersOpen ? 'rotate-180' : ''}`}>
                            ▼
                        </span>
                    </button>

                    <div className={`${filtersOpen ? 'block' : 'hidden'} lg:block p-6 border-t lg:border-t-0 border-white/10`}>
                        <form
                            className="flex flex-col lg:flex-row gap-4 items-center"
                            onSubmit={e => { e.preventDefault(); }}
                        >
                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
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
                                <input
                                    type="text"
                                    placeholder="Filtra per luogo..."
                                    value={locationFilter}
                                    onChange={(e) => setLocationFilter(e.target.value)}
                                    className="bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:bg-white/20 transition-all col-span-1"
                                />
                                <input
                                    type="text"
                                    placeholder="Filtra per organizzatore..."
                                    value={organizerFilter}
                                    onChange={(e) => setOrganizerFilter(e.target.value)}
                                    className="bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:bg-white/20 transition-all col-span-1"
                                />
                            </div>

                            <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
                                <label className="flex items-center gap-2 text-white font-medium cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={onlyToday}
                                        onChange={e => setOnlyToday(e.target.checked)}
                                        className="w-4 h-4 text-pink-500 bg-white/10 border-white/20 rounded focus:ring-pink-500 focus:ring-2"
                                    />
                                    Today only
                                </label>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {(() => {
                const displayedEvents = mode === 'quick' ? filteredEvents.slice(0, visibleCount) : filteredEvents;
                const gridClasses = mode === 'quick'
                    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6'
                    : 'grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6';

                return (
                    <>
                        <div className={gridClasses}>
                            {filteredEvents.length === 0 ? (
                                <div className="col-span-full text-center py-16">
                                    <div className="text-6xl mb-4">🎵</div>
                                    <h3 className="text-2xl font-bold text-white mb-2">No events found</h3>
                                    <p className="text-gray-400">Try adjusting your search filters or create a new event</p>
                                </div>
                            ) : (
                                displayedEvents.map((event) => (
                                    <TransitionLink
                                        key={event.id}
                                        href={`/events/${generateUniqueSlug(event.title, event.id)}`}
                                        className="card bg-base-100/5 border border-base-200/40 cursor-pointer group block no-underline hover:border-primary/60 hover:shadow-xl transition-all duration-300"
                                    >
                                        {/* Event Image */}
                                        <div className="relative overflow-hidden">
                                            <FavoriteButton
                                                eventId={event.id}
                                                initialIsFavorite={favoriteIds.has(event.id)}
                                                onToggle={(newValue) => handleFavoriteToggleLocal(event.id, newValue)}
                                            />
                                            {event.imageUrl ? (
                                                <Image
                                                    src={event.imageUrl.startsWith('/uploads/') ? event.imageUrl : event.imageUrl}
                                                    alt={event.title}
                                                    width={600}
                                                    height={400}
                                                    className="w-full h-48 object-cover transition-transform duration-300 group-hover:scale-110"
                                                    sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                                                />
                                            ) : (
                                                <div className="w-full h-48 bg-linear-to-br from-pink-500/20 to-purple-600/20 flex items-center justify-center">
                                                    <div className="text-4xl opacity-50">🎵</div>
                                                </div>
                                            )}

                                            {/* Price Badge - normalizzato in 3 stati */}
                                            {(() => {
                                                const label = getPriceLabel(event.price);
                                                return (
                                                    <div
                                                        className={`absolute top-3 right-3 rounded-full px-3 py-1 text-xs sm:text-sm font-semibold border border-white/40 backdrop-blur-sm shadow-lg ${getPriceBadgeClasses(label)}`}
                                                    >
                                                        {label}
                                                    </div>
                                                );
                                            })()}
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
                                                    {event.time && event.time.trim().toLowerCase() !== 'non trovato' && (
                                                        <span className="text-gray-500">• {event.time}</span>
                                                    )}
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

                                            {/* Category Badge - più visibile */}
                                            {event.category && (
                                                <div className="pt-2">
                                                    <span
                                                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-white border border-white/30 backdrop-blur-sm shadow-md ${getCategoryBadgeClasses(event.category)}`}
                                                    >
                                                        {event.category}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </TransitionLink>
                                ))
                            )}
                        </div>

                        {mode === 'quick' && filteredEvents.length > visibleCount && (
                            <div className="flex justify-center pt-2">
                                <button
                                    onClick={() => setVisibleCount((prev) => prev + 4)}
                                    className="btn btn-primary px-8"
                                >
                                    Mostra altri
                                </button>
                            </div>
                        )}
                    </>
                );
            })()}
        </div>
    );
}