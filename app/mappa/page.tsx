'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import Link from 'next/link';
import { usePublicEvents } from '../components/PublicEventsProvider';
import { generateUniqueSlug } from '../../lib/slug-utils';
import { calendarDateLabel } from '../../lib/calendar-view';

function MapEventFallback() {
    const events = usePublicEvents();
    return (
        <section className="h-full overflow-y-auto p-5 md:p-8" aria-label="Eventi per luogo">
            <h2 className="text-2xl font-bold mb-4">Eventi per luogo</h2>
            {events?.length ? (
                <ul className="divide-y divide-black/15">
                    {events.map(event => (
                        <li key={event.id} className="py-4">
                            <Link href={`/events/${generateUniqueSlug(event.title, event.id)}`} className="font-bold underline underline-offset-4">
                                {event.title}
                            </Link>
                            <p><time dateTime={event.date}>{calendarDateLabel(event.date)}</time>{event.time ? `, ${event.time}` : ''}</p>
                            {event.location && <p>{event.location}</p>}
                        </li>
                    ))}
                </ul>
            ) : <p>{events === undefined ? 'Eventi temporaneamente non disponibili.' : 'Nessun evento disponibile in questo momento.'}</p>}
            <Link href="/eventi" className="inline-block mt-4 underline underline-offset-4">Tutti gli eventi</Link>
        </section>
    );
}

// Importo EventMap dinamicamente per evitare SSR (Leaflet funziona solo client-side)
const EventMap = dynamic(() => import('../components/EventMap'), {
    ssr: false,
    loading: MapEventFallback,
});

export default function MappaPage() {
    useEffect(() => {
        const previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousBodyOverflow;
        };
    }, []);

    return (
        <main className="map-app-screen w-full bg-[#f5f2ec]" aria-label="Mappa degli eventi">
            <h1 className="sr-only">Mappa eventi Schio e Alto Vicentino</h1>
            <div className="h-full w-full">
                <div className="h-full w-full overflow-hidden bg-white">
                    <EventMap />
                </div>
            </div>
        </main>
    );
}
