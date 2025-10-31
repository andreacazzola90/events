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
        <main className="min-h-screen p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                <div className="text-center space-y-4">
                    <h1 className="text-4xl font-bold">Mappa Eventi</h1>
                    <p className="text-xl text-gray-600">
                        Visualizza tutti gli eventi sulla mappa in base alla loro posizione
                    </p>
                </div>

                <EventMap />

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800">
                        💡 <strong>Suggerimento:</strong> Clicca sui marker sulla mappa per vedere i dettagli di ogni evento.
                        La geocodifica delle località avviene automaticamente tramite OpenStreetMap.
                    </p>
                </div>
            </div>
        </main>
    );
}
