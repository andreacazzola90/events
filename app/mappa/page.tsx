'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';

// Importo EventMap dinamicamente per evitare SSR (Leaflet funziona solo client-side)
const EventMap = dynamic(() => import('../components/EventMap'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-full bg-gray-100">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Caricamento mappa...</p>
            </div>
        </div>
    ),
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
        <main className="h-[calc(100vh-4rem)] w-full bg-black">
            <div className="h-full w-full">
                <div className="h-full w-full">
                    <EventMap />
                </div>
            </div>
        </main>
    );
}
