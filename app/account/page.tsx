'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

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
        <main className="min-h-screen py-8 px-2 bg-light w-full">
            <div className="container mx-auto px-8">
                <div className="w-full space-y-8">
                    {/* Header Account */}
                    <div className="bg-white rounded-2xl shadow-card p-8 md:p-12">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                            <div className="flex-1">
                                <h1 className="text-4xl md:text-5xl font-extrabold text-primary drop-shadow-lg tracking-tight mb-4">
                                    Il Mio Account
                                </h1>
                                <div className="space-y-2 text-lg">
                                    <p>
                                        <strong className="text-gray-700">Nome:</strong>{' '}
                                        <span className="text-gray-900">{session.user?.name || 'Non disponibile'}</span>
                                    </p>
                                    <p>
                                        <strong className="text-gray-700">Email:</strong>{' '}
                                        <span className="text-gray-900">{session.user?.email}</span>
                                    </p>
                                    <p>
                                        <strong className="text-gray-700">ID Utente:</strong>{' '}
                                        <span className="text-gray-900 font-mono text-sm">{(session.user as any)?.id || 'N/A'}</span>
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-col gap-4">
                                <button
                                    onClick={handleLogout}
                                    className="px-6 py-3 rounded-full font-bold shadow-button bg-linear-to-r from-pink-500 via-red-500 to-yellow-500 text-white hover:shadow-lg transition-all"
                                >
                                    Logout
                                </button>
                                <button
                                    onClick={() => router.push('/crea')}
                                    className="px-6 py-3 rounded-full font-bold shadow-button bg-linear-to-r from-primary via-accent to-secondary text-white hover:shadow-lg transition-all"
                                >
                                    Crea Evento
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Eventi creati dall'utente */}
                    <div className="bg-white rounded-2xl shadow-card p-8 md:p-12">
                        <h2 className="text-3xl font-bold text-primary mb-6">I Miei Eventi Creati</h2>
                        {userEvents.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                <p className="text-xl mb-4">Non hai ancora creato eventi.</p>
                                <button
                                    onClick={() => router.push('/crea')}
                                    className="px-6 py-3 rounded-full font-bold shadow-button bg-linear-to-r from-primary via-accent to-secondary text-white hover:shadow-lg transition-all"
                                >
                                    Crea il tuo primo evento
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                {userEvents.map((event) => (
                                    <div
                                        key={event.id}
                                        className="bg-gray-50 rounded-xl p-6 border border-gray-200 cursor-pointer hover:shadow-lg transition-shadow"
                                        onClick={() => router.push(`/events/${event.id}`)}
                                    >
                                        {event.imageUrl && (
                                            <img
                                                src={event.imageUrl.startsWith('/uploads/') ? event.imageUrl : event.imageUrl}
                                                alt={event.title}
                                                className="w-full h-40 object-cover rounded-lg mb-4"
                                            />
                                        )}
                                        <h3 className="text-xl font-bold mb-2 text-gray-900">{event.title}</h3>
                                        <p className="text-gray-600 text-sm mb-3 line-clamp-2">{event.description}</p>
                                        <div className="space-y-1 text-sm text-gray-500">
                                            <p>📅 {event.date} • {event.time}</p>
                                            <p>📍 {event.location}</p>
                                            {event.category && <p>🏷️ {event.category}</p>}
                                        </div>
                                        <div className="mt-4 flex gap-2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    router.push(`/events/${event.id}/edit`);
                                                }}
                                                className="flex-1 px-4 py-2 rounded-full font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200 transition-all text-sm"
                                            >
                                                Modifica
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Statistiche */}
                    <div className="bg-white rounded-2xl shadow-card p-8 md:p-12">
                        <h2 className="text-3xl font-bold text-primary mb-6">Statistiche</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-linear-to-br from-primary to-accent rounded-xl p-6 text-white">
                                <div className="text-4xl font-extrabold mb-2">{userEvents.length}</div>
                                <div className="text-lg opacity-90">Eventi Creati</div>
                            </div>
                            <div className="bg-linear-to-br from-secondary to-accent rounded-xl p-6 text-white">
                                <div className="text-4xl font-extrabold mb-2">
                                    {userEvents.filter(e => new Date(e.date) >= new Date()).length}
                                </div>
                                <div className="text-lg opacity-90">Eventi Futuri</div>
                            </div>
                            <div className="bg-linear-to-br from-accent to-primary rounded-xl p-6 text-white">
                                <div className="text-4xl font-extrabold mb-2">
                                    {new Set(userEvents.map(e => e.category)).size}
                                </div>
                                <div className="text-lg opacity-90">Categorie Diverse</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
