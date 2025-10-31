'use client';

import EventList from './components/EventList';

export default function Home() {
    return (
        <main className="min-h-screen p-8">
            <div className="max-w-6xl mx-auto space-y-8">
                <div className="text-center space-y-4">
                    <h1 className="text-4xl font-bold">Eventi Salvati</h1>
                    <p className="text-xl text-gray-600">
                        Tutti gli eventi che hai salvato nel database
                    </p>
                </div>

                <EventList />
            </div>
        </main>
    );
}