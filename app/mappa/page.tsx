'use client';

import dynamic from 'next/dynamic';

// Importo EventMap dinamicamente per evitare SSR (Leaflet funziona solo client-side)
const EventMap = dynamic(() => import('../components/EventMap'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-[600px] bg-gray-100 rounded-lg">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Caricamento mappa...</p>
            </div>
        </div>
    ),
});

export default function MappaPage() {
    return (
        <main className="min-h-screen py-4 md:py-8 px-2 bg-light w-full">
            <div className="max-w-[1800px] mx-auto px-4 md:px-8">
                <div className="w-full space-y-8">
                    <div className="w-full text-center space-y-4">
                        <h1 className="text-4xl md:text-5xl font-extrabold text-primary drop-shadow-lg tracking-tight">Mappa Eventi</h1>
                        <p className="text-xl md:text-2xl text-dark/70 font-semibold">
                            Visualizza tutti gli eventi sulla mappa in base alla loro posizione
                        </p>
                    </div>
                    <div className="card w-full max-w-full">
                        <EventMap />
                    </div>
                    <div className="badge mt-4 inline-block">
                        💡 <strong>Suggerimento:</strong> Clicca sui marker sulla mappa per vedere i dettagli di ogni evento. La geocodifica delle località avviene automaticamente tramite OpenStreetMap.
                    </div>
                </div>
            </div>
        </main>
    );
}
