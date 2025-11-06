'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { generateUniqueSlug } from '../../lib/slug-utils';

interface UserEvent {
    id: number;
    title: string;
    description: string;
    date: string;
    time: string;
    location: string;
    category: string;
    imageUrl: string | null;
}

export default function AccountPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [userEvents, setUserEvents] = useState<UserEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.replace('/auth');
        }
    }, [status, router]);

    useEffect(() => {
        if (session) {
            fetchUserEvents();
        }
    }, [session]);

    const fetchUserEvents = async () => {
        try {
            const response = await fetch('/api/events?userId=' + (session?.user as any)?.id);
            if (response.ok) {
                const data = await response.json();
                setUserEvents(data);
            }
        } catch (error) {
            console.error('Error fetching user events:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await signOut({ redirect: false });
        router.push('/');
    };

    if (status === 'loading' || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center text-2xl">
                Caricamento...
            </div>
        );
    }

    if (!session) {
        return null;
    }

    return (
        <main className="min-h-screen">
            {/* Hero Section */}
            <section className="hero-section">
                <div className="max-w-6xl mx-auto px-6 py-16">
                    <div className="glass-effect rounded-3xl p-8 md:p-12 animate-fadeInUp">
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
                            <div className="flex-1">
                                <h1 className="text-5xl md:text-6xl font-black mb-6 leading-tight">
                                    Your <span className="gradient-text">Profile</span>
                                </h1>
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-linear-to-br from-pink-500 to-purple-600 rounded-full flex items-center justify-center">
                                            <span className="text-xl">👤</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-400 text-sm">Name</span>
                                            <p className="text-white font-semibold text-lg">{session.user?.name || 'Not available'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-linear-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center">
                                            <span className="text-xl">📧</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-400 text-sm">Email</span>
                                            <p className="text-white font-semibold text-lg">{session.user?.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-linear-to-br from-pink-600 to-purple-500 rounded-full flex items-center justify-center">
                                            <span className="text-xl">🆔</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-400 text-sm">User ID</span>
                                            <p className="text-white font-mono text-sm">{(session.user as any)?.id || 'N/A'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-4">
                                <button
                                    onClick={() => router.push('/crea')}
                                    className="inline-flex items-center gap-3 bg-linear-to-r from-pink-500 to-purple-600 text-white px-8 py-4 rounded-2xl font-bold text-lg transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-pink-500/25"
                                >
                                    ✨ Create Event
                                </button>
                                <button
                                    onClick={handleLogout}
                                    className="inline-flex items-center gap-3 bg-white/10 text-white px-8 py-4 rounded-2xl font-semibold border border-white/20 transition-all duration-300 hover:bg-white/20 hover:scale-105"
                                >
                                    🚪 Logout
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <div className="max-w-6xl mx-auto px-6 pb-16 space-y-8">

                {/* Your Events Section */}
                <div className="glass-effect rounded-2xl p-8">
                    <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                        <span className="text-2xl">🎵</span>
                        Your Events
                    </h2>
                    {userEvents.length === 0 ? (
                        <div className="text-center py-16">
                            <div className="text-6xl mb-4">🎭</div>
                            <h3 className="text-2xl font-bold text-white mb-2">No events yet</h3>
                            <p className="text-gray-400 mb-6">Start creating your first event and share it with the world</p>
                            <button
                                onClick={() => router.push('/crea')}
                                className="inline-flex items-center gap-3 bg-linear-to-r from-pink-500 to-purple-600 text-white px-8 py-4 rounded-2xl font-bold transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-pink-500/25"
                            >
                                ✨ Create Your First Event
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {userEvents.map((event) => (
                                <div
                                    key={event.id}
                                    className="event-card cursor-pointer group"
                                    onClick={() => router.push(`/events/${generateUniqueSlug(event.title, event.id)}`)}
                                >
                                    {/* Event Image */}
                                    <div className="relative overflow-hidden">
                                        {event.imageUrl ? (
                                            <img
                                                src={event.imageUrl.startsWith('/uploads/') ? event.imageUrl : event.imageUrl}
                                                alt={event.title}
                                                className="w-full h-40 object-cover transition-transform duration-300 group-hover:scale-110"
                                            />
                                        ) : (
                                            <div className="w-full h-40 bg-linear-to-br from-pink-500/20 to-purple-600/20 flex items-center justify-center">
                                                <div className="text-4xl opacity-50">🎵</div>
                                            </div>
                                        )}

                                        {/* Owner Badge */}
                                        <div className="absolute top-3 right-3 bg-green-500 text-white px-2 py-1 rounded-lg text-xs font-semibold">
                                            YOURS
                                        </div>
                                    </div>

                                    {/* Event Details */}
                                    <div className="p-5 space-y-3">
                                        <h3 className="text-xl font-bold text-white leading-tight line-clamp-2 group-hover:text-pink-400 transition-colors">
                                            {event.title}
                                        </h3>
                                        <p className="text-gray-400 text-sm line-clamp-2">
                                            {event.description}
                                        </p>

                                        <div className="space-y-1 text-sm text-gray-300">
                                            <div className="flex items-center gap-2">
                                                <span>📅</span>
                                                <span>{event.date} • {event.time}</span>
                                            </div>
                                            <div className="flex items-center gap-2 line-clamp-1">
                                                <span>📍</span>
                                                <span className="truncate">{event.location}</span>
                                            </div>
                                            {event.category && (
                                                <div className="flex items-center gap-2">
                                                    <span>🏷️</span>
                                                    <span>{event.category}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Action Button */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                router.push(`/events/${generateUniqueSlug(event.title, event.id)}/edit`);
                                            }}
                                            className="w-full mt-4 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-semibold transition-all duration-200 border border-white/20 hover:scale-105"
                                        >
                                            ✏️ Edit Event
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Statistics Section */}
                <div className="glass-effect rounded-2xl p-8">
                    <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
                        <span className="text-2xl">📊</span>
                        Your Stats
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-linear-to-br from-pink-500 to-purple-600 rounded-2xl p-6 text-white relative overflow-hidden">
                            <div className="relative z-10">
                                <div className="text-4xl font-black mb-2">{userEvents.length}</div>
                                <div className="text-lg font-semibold opacity-90">Events Created</div>
                            </div>
                            <div className="absolute -top-4 -right-4 text-6xl opacity-20">🎵</div>
                        </div>

                        <div className="bg-linear-to-br from-purple-500 to-pink-600 rounded-2xl p-6 text-white relative overflow-hidden">
                            <div className="relative z-10">
                                <div className="text-4xl font-black mb-2">
                                    {userEvents.filter(e => new Date(e.date) >= new Date()).length}
                                </div>
                                <div className="text-lg font-semibold opacity-90">Upcoming Events</div>
                            </div>
                            <div className="absolute -top-4 -right-4 text-6xl opacity-20">🚀</div>
                        </div>

                        <div className="bg-linear-to-br from-pink-600 to-purple-500 rounded-2xl p-6 text-white relative overflow-hidden">
                            <div className="relative z-10">
                                <div className="text-4xl font-black mb-2">
                                    {new Set(userEvents.map(e => e.category)).size}
                                </div>
                                <div className="text-lg font-semibold opacity-90">Categories</div>
                            </div>
                            <div className="absolute -top-4 -right-4 text-6xl opacity-20">🏷️</div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
