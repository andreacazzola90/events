'use client';

import { useState, useEffect, Suspense } from 'react';
import { trackEventCreate, trackGTMEvent } from '../lib/gtm';
import { trackEvent } from '../lib/analytics';
import LoadingAnimation from '../components/LoadingAnimation';
import { useRouter } from 'next/navigation';
import ImageUploader from '../components/ImageUploader';
import { EventData } from '../types/event';
import EventDisplay from '../components/EventDisplay';
import MultipleEventsEditor from '../components/MultipleEventsEditor';
import SharedImageHandler from '../components/SharedImageHandler';
import DebugInfoDisplay from '../components/DebugInfoDisplay';

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

export default function CreaEvento() {
    const router = useRouter();
    const [events, setEvents] = useState<EventData[]>([]);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [linkUrl, setLinkUrl] = useState('');
    const [loadingLink, setLoadingLink] = useState(false);
    const [saving, setSaving] = useState(false);
    const [debugInfo, setDebugInfo] = useState<any>(null);

    useEffect(() => {
        return () => {
            // Cleanup any object URLs when component unmounts
            if (imageUrl) {
                URL.revokeObjectURL(imageUrl);
            }
        };
    }, [imageUrl]);

    const handleNewEvents = (newEventsOrSingle: EventData | EventData[], newImageUrl: string, debug?: any) => {
        // Cleanup previous image URL if it exists
        if (imageUrl) {
            URL.revokeObjectURL(imageUrl);
        }

        // Converti in array se è un singolo evento
        const newEvents = Array.isArray(newEventsOrSingle) ? newEventsOrSingle : [newEventsOrSingle];

        // Normalizza e aggiungi imageUrl
        let eventsWithImage = newEvents.map(ev => normalizeEventFields({
            ...ev,
            imageUrl: ev.imageUrl || newImageUrl
        }));

        // Se ci sono più eventi, controlla se hanno stessa data e orario
        // In quel caso probabilmente è un duplicato, tieni solo il primo
        if (eventsWithImage.length > 1) {
            const firstEvent = eventsWithImage[0];
            const allSameDateTime = eventsWithImage.every(ev =>
                ev.date === firstEvent.date && ev.time === firstEvent.time
            );

            if (allSameDateTime) {
                console.log('[handleNewEvents] Eventi con stessa data/orario rilevati - probabile duplicato, uso solo il primo');
                eventsWithImage = [firstEvent];
            }
        }

        console.log(`[handleNewEvents] Processati ${eventsWithImage.length} eventi`);
        setEvents(eventsWithImage);
        setImageUrl(newImageUrl);
        setDebugInfo(debug);
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

                    // Track event creation
                    const savedEvent = await saveResponse.json();
                    trackEventCreate(savedEvent);
                    trackEvent('event_create', 'Events', eventData.title);
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

                    // Track event creation
                    const savedEvent = await response.json();
                    trackEventCreate(savedEvent);
                    trackEvent('event_create', 'Events', eventData.title);
                }
            }
            console.log(`Successfully saved ${eventsToSave.length} events`);

            // Clear service worker cache
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                console.log('[Crea] Sending CLEAR_CACHE message to service worker');
                navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            // Reset state after successful save
            setEvents([]);
            setImageUrl(null);
            setDebugInfo(null);
            // Redirect to homepage to see saved events
            router.push('/');
        } catch (error) {
            console.error('Error saving events:', error);
            throw error; // Re-throw to let the MultipleEventsEditor handle it
        }
    };

    const handleSaveSingle = async (updatedData: EventData) => {
        setSaving(true);
        setError(null);
        try {
            let savedEvent;

            // Salva l'evento sul database
            if (updatedData.imageUrl && updatedData.imageUrl.startsWith('blob:')) {
                const response = await fetch(updatedData.imageUrl);
                const blob = await response.blob();
                const formData = new FormData();
                formData.append('eventData', JSON.stringify(updatedData));
                formData.append('image', blob, 'event-image.jpg');

                const saveResponse = await fetch('/api/events', {
                    method: 'POST',
                    body: formData,
                });

                if (!saveResponse.ok) {
                    throw new Error('Failed to save event');
                }

                savedEvent = await saveResponse.json();
            } else {
                // No image upload needed, use regular JSON
                const response = await fetch('/api/events', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(updatedData),
                });

                if (!response.ok) {
                    throw new Error('Failed to save event');
                }

                savedEvent = await response.json();
            }

            // Track event creation
            trackEventCreate(savedEvent);
            trackEvent('event_create', 'Events', updatedData.title);

            console.log('Event saved successfully, ID:', savedEvent.id);

            // Clear service worker cache
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                console.log('[App] Sending CLEAR_CACHE message to service worker');
                navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });

                // Wait a moment for cache to clear
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            // Force hard reload to bypass all cache
            console.log('Forcing hard reload to homepage');
            window.location.href = '/?refresh=' + Date.now();
        } catch (error) {
            console.error('Error saving event:', error);
            setError(error instanceof Error ? error.message : 'Errore nel salvataggio dell\'evento');
            setSaving(false);
        }
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
            const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 secondi - ottimizzato

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
                setDebugInfo(null); // Link extraction doesn't support debug info yet
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
        <>
            {/* Shared Image Handler with Suspense */}
            <Suspense fallback={null}>
                <SharedImageHandler onProcessed={handleNewEvents} />
            </Suspense>

            <main className="min-h-screen">
                {/* Hero Section */}
                <section className="hero-section">
                    <div className="max-w-6xl mx-auto px-6 py-8 md:py-16 text-center">
                        <div className="animate-fadeInUp">
                            <h1 className="text-5xl md:text-6xl font-black mb-6 leading-tight">
                                {events.length > 0 ? (
                                    <>Edit your <span className="gradient-text">event</span></>
                                ) : (
                                    <>Create something <span className="gradient-text">incredible</span></>
                                )}
                            </h1>
                            <p className="text-xl md:text-2xl text-gray-400 mb-8 max-w-2xl mx-auto leading-relaxed">
                                {events.length > 0
                                    ? 'Fine-tune the extracted information and make your event perfect'
                                    : 'Upload an event image or link and let our AI extract all the details for you'
                                }
                            </p>

                            {events.length > 0 && (
                                <button
                                    onClick={() => {
                                        setEvents([]);
                                        setImageUrl(null);
                                        setDebugInfo(null);
                                        setError(null);
                                    }}
                                    className="inline-flex items-center gap-2 bg-white/10 text-white px-6 py-3 rounded-lg font-semibold border border-white/20 transition-all duration-300 hover:bg-white/20 hover:scale-105"
                                >
                                    ← Create New Event
                                </button>
                            )}
                        </div>
                    </div>
                </section>

                <div className="max-w-6xl mx-auto px-6 pb-16">
                    <div className="space-y-8">
                        {/* Creation Methods - Only show if no events extracted */}
                        {events.length === 0 && (
                            <div className="grid md:grid-cols-2 gap-8">
                                {/* Image Upload Method - First on Mobile */}
                                <div className="glass-effect p-8 rounded-2xl border border-white/10 order-1 md:order-2">
                                    <div className="text-center mb-6">
                                        <div className="w-16 h-16 bg-linear-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                            <span className="text-2xl">📸</span>
                                        </div>
                                        <h2 className="text-2xl font-bold text-white mb-2">Upload Image</h2>
                                        <p className="text-gray-400">Upload an event poster and AI will scan all the details</p>
                                    </div>

                                    <ImageUploader
                                        onProcessed={(data, imgUrl, debug) => handleNewEvents(data, imgUrl, debug)}
                                        onError={(message: string) => {
                                            setError(message);
                                            setEvents([]);
                                            setImageUrl(null);
                                            setDebugInfo(null);
                                        }}
                                    />
                                </div>

                                {/* Link Input Method - Second on Mobile */}
                                <div className="glass-effect p-8 rounded-2xl border border-white/10 order-2 md:order-1">
                                    <div className="text-center mb-6">
                                        <div className="w-16 h-16 bg-linear-to-br from-pink-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                            <span className="text-2xl">🔗</span>
                                        </div>
                                        <h2 className="text-2xl font-bold text-white mb-2">Extract from Link</h2>
                                        <p className="text-gray-400">Paste an event URL and let AI extract all the details</p>
                                    </div>

                                    <form onSubmit={handleLinkSubmit} className="space-y-4">
                                        {loadingLink ? (
                                            <LoadingAnimation message="Processing link" />
                                        ) : (
                                            <>
                                                <input
                                                    type="url"
                                                    placeholder="https://example.com/event"
                                                    value={linkUrl}
                                                    onChange={(e) => setLinkUrl(e.target.value)}
                                                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:bg-white/20 transition-all"
                                                    disabled={loadingLink}
                                                />
                                                <button
                                                    type="submit"
                                                    disabled={loadingLink}
                                                    className="w-full bg-linear-to-r from-pink-500 to-purple-600 text-white py-3 rounded-lg font-semibold transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-pink-500/25 disabled:opacity-50 disabled:hover:scale-100"
                                                >
                                                    ✨ Extract Event
                                                </button>
                                            </>
                                        )}
                                    </form>
                                </div>
                            </div>
                        )}

                        {/* Error Display */}
                        {error && (
                            <div className="glass-effect border-red-500/50 bg-red-500/10 p-6 rounded-xl animate-fadeInUp">
                                <div className="flex items-start gap-4">
                                    <span className="text-red-400 text-3xl shrink-0">⚠️</span>
                                    <div className="flex-1">
                                        <h3 className="text-red-300 font-semibold text-lg mb-2">Si è verificato un errore</h3>
                                        <p className="text-red-200 leading-relaxed">{error}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Debug Info Display */}
                        {events.length > 0 && debugInfo && (
                            <div className="animate-fadeInUp">
                                <DebugInfoDisplay debugInfo={debugInfo} />
                            </div>
                        )}

                        {/* Event Editing Interface */}
                        {saving ? (
                            <div className="glass-effect p-8 rounded-2xl border border-white/10 animate-fadeInUp">
                                <LoadingAnimation message="Saving event..." />
                            </div>
                        ) : events.length > 1 ? (
                            <MultipleEventsEditor
                                events={events}
                                onSaveAll={handleSaveAll}
                            />
                        ) : events.length === 1 ? (
                            <EventDisplay eventData={events[0]} onSave={handleSaveSingle} />
                        ) : null}
                    </div>
                </div>
            </main>
        </>
    );
}
