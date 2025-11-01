'use client';

import EventList from './components/EventList';

export default function Home() {
    return (
        <main className="min-h-screen py-8 px-2 bg-light w-full">
            <div className="container mx-auto px-8">
                <div className="w-full space-y-8">
                    <div className="w-full text-center space-y-4">
                        <h1 className="text-4xl md:text-5xl font-extrabold text-primary drop-shadow-lg tracking-tight">Eventi Salvati</h1>
                        <p className="text-xl md:text-2xl text-dark/70 font-semibold">
                            Tutti gli eventi che hai salvato nel database
                        </p>
                    </div>
                    <div className="card w-full max-w-full">
                        <EventList />
                    </div>
                </div>
            </div>
        </main>
    );
}