'use client';

import EventList from './components/EventList';
import Link from 'next/link';

export default function Home() {
    return (
        <main className="min-h-screen">
            {/* Hero Section - Dice.fm Style */}
            <section className="hero-section">
                <div className="max-w-7xl mx-auto px-6 py-16 text-center">
                    <div className="animate-fadeInUp">
                        <h1 className="text-5xl md:text-7xl font-black mb-6 leading-tight">
                            Welcome to the
                            <br />
                            <span className="gradient-text">alternative</span>
                        </h1>
                        <p className="text-xl md:text-2xl text-gray-400 mb-8 max-w-2xl mx-auto leading-relaxed">
                            Incredible events. Upfront pricing. Relevant recommendations.
                            EventScanner makes going out easy.
                        </p>

                        {/* CTA Buttons */}
                        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
                            <Link
                                href="/crea"
                                className="inline-flex items-center gap-3 bg-linear-to-r from-pink-500 to-purple-600 text-white px-8 py-4 rounded-2xl font-bold text-lg transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-pink-500/25"
                            >
                                ✨ Crea Evento
                            </Link>
                            <Link
                                href="/mappa"
                                className="inline-flex items-center gap-3 bg-white/10 text-white px-8 py-4 rounded-2xl font-semibold text-lg border border-white/20 transition-all duration-300 hover:bg-white/20 hover:scale-105"
                            >
                                🗺️ Esplora Mappa
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Events Section */}
            <section className="py-16">
                <div className="max-w-7xl mx-auto px-6">
                    {/* Section Header */}
                    <div className="text-center mb-12">
                        <h2 className="text-4xl md:text-5xl font-bold mb-4">
                            Trending Events
                        </h2>
                        <p className="text-xl text-gray-400 max-w-3xl mx-auto">
                            Check out some of the most popular events coming up, from club nights
                            and gigs to artist signings and comedy shows.
                        </p>
                    </div>

                    {/* Events List */}
                    <div className="animate-fadeInUp">
                        <EventList />
                    </div>
                </div>
            </section>

            {/* Features Section - Dice Style */}
            <section className="py-16 bg-gradient-to-b from-transparent to-black/20">
                <div className="max-w-7xl mx-auto px-6">
                    <h2 className="text-4xl font-bold text-center mb-12">What else?</h2>

                    <div className="grid md:grid-cols-3 gap-8">
                        <div className="text-center p-8 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-300">
                            <div className="text-5xl mb-4">🎟️</div>
                            <h3 className="text-xl font-bold mb-2">Easy Event Creation</h3>
                            <p className="text-gray-400">Create events in less time than it took to read this</p>
                        </div>

                        <div className="text-center p-8 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-300">
                            <div className="text-5xl mb-4">🤖</div>
                            <h3 className="text-xl font-bold mb-2">AI-Powered Scanning</h3>
                            <p className="text-gray-400">Scan event images and get all details automatically</p>
                        </div>

                        <div className="text-center p-8 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-300">
                            <div className="text-5xl mb-4">📍</div>
                            <h3 className="text-xl font-bold mb-2">Interactive Maps</h3>
                            <p className="text-gray-400">Find events near you with our interactive map view</p>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}