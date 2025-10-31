'use client';

import { useState, useEffect } from 'react';
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
        // Assicura che ogni evento abbia imageUrl valorizzato
        const eventsWithImage = newEvents.map(ev => ({
            ...ev,
            imageUrl: ev.imageUrl || newImageUrl
        }));
        setEvents(eventsWithImage);
        setImageUrl(newImageUrl);
        setError(null);
    };

    const handleSaveAll = async (eventsToSave: EventData[]) => {
        try {
            // Save each event
            for (const eventData of eventsToSave) {
                // Check if there's an image URL that needs to be uploaded
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

    return (
        <main className="min-h-screen p-8">
            <div className="max-w-6xl mx-auto space-y-8">
                <div className="text-center space-y-4">
                    <h1 className="text-4xl font-bold">Crea Nuovo Evento</h1>
                    <p className="text-xl text-gray-600">
                        Carica l'immagine di un evento e lascia che l'AI estragga tutte le informazioni
                    </p>
                </div>

                <div className="space-y-8">
                    <ImageUploader
                        onProcessed={handleNewEvents}
                        onError={(message: string) => {
                            setError(message);
                            setEvents([]);
                            setImageUrl(null);
                        }}
                    />

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
                            {error}
                        </div>
                    )}

                    {events.length > 1 ? (
                        <MultipleEventsEditor
                            events={events}
                            imageUrl={imageUrl || undefined}
                            onSaveAll={handleSaveAll}
                        />
                    ) : events.length === 1 ? (
                        <EventDisplay eventData={events[0]} onSave={handleSaveSingle} />
                    ) : null}
                </div>
            </div>
        </main>
    );
}
