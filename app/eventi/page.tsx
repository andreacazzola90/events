'use client';

import EventList from '../components/EventList';

export default function EventiPage() {
    return (
        <main className="min-h-screen py-12">
            <div className="max-w-7xl mx-auto px-6">
                <div className="mb-12">
                    <h1 className="text-4xl md:text-5xl font-bold mb-4">
                        Tutti gli Eventi
                    </h1>
                    <p className="text-xl text-gray-400">
                        Esplora tutti gli eventi in programma nella tua zona.
                    </p>
                </div>

                <div className="animate-fadeInUp">
                    <EventList />
                </div>
            </div>
        </main>
    );
}
