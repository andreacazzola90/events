'use client';

import { useState, useEffect } from 'react';
// Normalizza data (DD/MM/YYYY), ora (HH:MM) e luogo (trim)
function normalizeEventFields(event: EventData): EventData {
    // Normalizza data: accetta YYYY-MM-DD, DD/MM/YYYY, ecc.
    let { date, time, location } = event;
    // Data
    if (date) {
        // Se è YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            const [y, m, d] = date.split('-');
            date = `${d}/${m}/${y}`;
        } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
            // già ok
        } else {
            // fallback: prendi solo numeri
            const nums = date.match(/\d+/g);
            if (nums && nums.length >= 3) {
                date = `${nums[0].padStart(2, '0')}/${nums[1].padStart(2, '0')}/${nums[2].padStart(4, '20')}`;
            }
        }
    }
    // Ora
    if (time) {
        const nums = time.match(/\d+/g);
        if (nums && nums.length >= 2) {
            time = `${nums[0].padStart(2, '0')}:${nums[1].padStart(2, '0')}`;
        } else {
            time = '';
        }
    }
    // Luogo
    if (location) {
        location = location.replace(/\s+/g, ' ').trim();
    }
    return { ...event, date, time, location };
}
import { useRouter } from 'next/navigation';
import ImageUploader from '../components/ImageUploader';
import { EventData } from '../types/event';
import EventDisplay from '../components/EventDisplay';
import MultipleEventsEditor from '../components/MultipleEventsEditor';

export default function CreaEvento() {
    const router = useRouter();
    const [events, setEvents] = useState<EventData[]>([]);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [linkUrl, setLinkUrl] = useState('');
    const [loadingLink, setLoadingLink] = useState(false);

    useEffect(() => {
        return () => {
            // Cleanup any object URLs when component unmounts
            if (imageUrl) {
                URL.revokeObjectURL(imageUrl);
            }
        };
    }, [imageUrl]);

    const handleNewEvents = (newEvents: EventData[], newImageUrl: string) => {
        // Cleanup previous image URL if it exists
        if (imageUrl) {
            URL.revokeObjectURL(imageUrl);
        }
        // Normalizza e aggiungi imageUrl
        const eventsWithImage = newEvents.map(ev => normalizeEventFields({
            ...ev,
            imageUrl: ev.imageUrl || newImageUrl
        }));
        setEvents(eventsWithImage);
        setImageUrl(newImageUrl);
        setError(null);
    };


    const handleSaveAll = async (eventsToSave: EventData[]) => {
        try {
            for (const eventData of eventsToSave) {
                // Se c'è un'immagine blob, carica con FormData
                if (eventData.imageUrl && eventData.imageUrl.startsWith('blob:')) {
                    const response = await fetch(eventData.imageUrl);
                    const blob = await response.blob();
                    const formData = new FormData();
                    formData.append('eventData', JSON.stringify(eventData));
                    formData.append('image', blob, 'event-image.jpg');

                    const saveResponse = await fetch('/api/events', {
                        method: 'POST',
                        body: formData,
                    });
                    if (!saveResponse.ok) {
                        throw new Error(`Failed to save event: ${eventData.title}`);
                    }
                } else {
                    // No image upload needed, use regular JSON
                    const response = await fetch('/api/events', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(eventData),
                    });
                    if (!response.ok) {
                        throw new Error(`Failed to save event: ${eventData.title}`);
                    }
                }
            }
            console.log(`Successfully saved ${eventsToSave.length} events`);
            // Reset state after successful save
            setEvents([]);
            setImageUrl(null);
            // Redirect to homepage to see saved events
            router.push('/');
        } catch (error) {
            console.error('Error saving events:', error);
            throw error; // Re-throw to let the MultipleEventsEditor handle it
        }
    };

    const handleSaveSingle = (updatedData: EventData) => {
        // Aggiorna solo lo stato locale dell'evento modificato
        setEvents(prev => prev.map(ev => ev === events[0] ? updatedData : ev));
        // Non fare redirect, lascia l'utente sulla pagina
    };

    const handleLinkSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!linkUrl.trim()) {
            setError('Inserisci un link valido');
            return;
        }

        // Check if it's a Facebook URL (including short links)
        const isFacebookUrl = linkUrl.includes('facebook.com') ||
            linkUrl.includes('fb.me') ||
            linkUrl.includes('fb.com') ||
            linkUrl.includes('m.facebook.com');

        if (isFacebookUrl) {
            alert('Gli eventi di Facebook non possono essere scansionati, prova a fare uno screenshot');
            return;
        }

        setLoadingLink(true);
        setError(null);

        try {
            // Create a fetch request with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 55000); // 55 second timeout

            const response = await fetch('/api/process-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: linkUrl }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error || 'Errore durante l\'elaborazione del link';
                throw new Error(errorMessage);
            }

            const data = await response.json();

            if (data.events && data.events.length > 0) {
                // Normalizza i campi estratti
                const normalized = data.events.map((ev: EventData) => normalizeEventFields(ev));
                setEvents(normalized);
                setImageUrl(data.imageUrl || null);
                setLinkUrl('');
            } else {
                setError('Nessun evento trovato dal link');
            }
        } catch (error) {
            console.error('Error processing link:', error);

            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    setError('La richiesta ha impiegato troppo tempo. Il server potrebbe essere occupato, riprova tra qualche minuto.');
                } else if (error.message.includes('Failed to fetch') || error.message.includes('ERR_NETWORK_CHANGED')) {
                    setError('Problema di connessione di rete. Controlla la connessione internet e riprova.');
                } else {
                    setError(error.message || 'Errore durante l\'elaborazione del link. Riprova.');
                }
            } else {
                setError('Errore durante l\'elaborazione del link. Riprova.');
            }
        } finally {
            setLoadingLink(false);
        }
    };

    return (
        <main className="min-h-screen py-8 px-2 bg-light w-full">
            <div className="container mx-auto px-8">
                <div className="w-full space-y-8">
                    <div className="w-full text-center space-y-4">
                        <h1 className="text-4xl md:text-5xl font-extrabold text-primary drop-shadow-lg tracking-tight">
                            {events.length > 0 ? 'Modifica Evento' : 'Crea Nuovo Evento'}
                        </h1>
                        <p className="text-xl md:text-2xl text-dark/70 font-semibold">
                            {events.length > 0
                                ? 'Rivedi e modifica le informazioni estratte'
                                : 'Carica l\'immagine di un evento e lascia che l\'AI estragga tutte le informazioni'
                            }
                        </p>
                        {events.length > 0 && (
                            <button
                                onClick={() => {
                                    setEvents([]);
                                    setImageUrl(null);
                                    setError(null);
                                }}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold transition-all"
                            >
                                ← Carica Nuovo Evento
                            </button>
                        )}
                    </div>
                    <div className="space-y-8 w-full">
                        {/* Mostra i form solo se non ci sono eventi estratti */}
                        {events.length === 0 && (
                            <>
                                {/* Link Input Form */}
                                <div className="bg-white rounded-2xl shadow-card p-8 border border-gray-200">
                                    <h2 className="text-2xl font-bold text-primary mb-4">Estrai Evento da Link</h2>
                                    <p className="text-gray-600 mb-6">Inserisci il link di un evento e l'AI estrarrà automaticamente tutte le informazioni</p>
                                    <form onSubmit={handleLinkSubmit} className="flex flex-col md:flex-row gap-4">
                                        <input
                                            type="url"
                                            placeholder="https://esempio.com/evento"
                                            value={linkUrl}
                                            onChange={(e) => setLinkUrl(e.target.value)}
                                            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition"
                                            disabled={loadingLink}
                                        />
                                        <button
                                            type="submit"
                                            disabled={loadingLink}
                                            className="px-6 py-3 rounded-full font-bold shadow-button bg-linear-to-r from-primary via-accent to-secondary text-white hover:shadow-lg transition-all disabled:opacity-50"
                                        >
                                            {loadingLink ? 'Elaborazione...' : 'Estrai Evento'}
                                        </button>
                                    </form>
                                </div>

                                {/* Divider */}
                                <div className="flex items-center gap-4">
                                    <div className="flex-1 h-px bg-gray-300"></div>
                                    <span className="text-gray-500 font-semibold">OPPURE</span>
                                    <div className="flex-1 h-px bg-gray-300"></div>
                                </div>

                                {/* Image Upload */}
                                <div className="bg-white rounded-2xl shadow-card p-8 border border-gray-200">
                                    <h2 className="text-2xl font-bold text-primary mb-4">Carica Immagine</h2>
                                    <p className="text-gray-600 mb-6">Carica l'immagine di un evento e l'AI estrarrà tutte le informazioni</p>
                                    <ImageUploader
                                        onProcessed={(data: EventData) => handleNewEvents([data], '')}
                                        onError={(message: string) => {
                                            setError(message);
                                            setEvents([]);
                                            setImageUrl(null);
                                        }}
                                    />
                                </div>
                            </>
                        )}

                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
                                {error}
                            </div>
                        )}
                        {events.length > 1 ? (
                            <MultipleEventsEditor
                                events={events}
                                onSaveAll={handleSaveAll}
                            />
                        ) : events.length === 1 ? (
                            <EventDisplay eventData={events[0]} onSave={handleSaveSingle} />
                        ) : null}
                    </div>
                </div>
            </div>
        </main>
    );
}
