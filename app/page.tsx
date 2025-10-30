'use client';

import { useState, useEffect } from 'react';
import ImageUploader from './components/ImageUploader';
import { EventData } from './types/event';
import EventDisplay from './components/EventDisplay';
import MultipleEventsEditor from './components/MultipleEventsEditor';
import EventList from './components/EventList';

export default function Home() {
    const [events, setEvents] = useState<EventData[]>([]);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'upload' | 'list'>('list');

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

            // Switch to list view to see the saved events
            setActiveTab('list');
        } catch (error) {
            console.error('Error saving events:', error);
            throw error; // Re-throw to let the MultipleEventsEditor handle it
        }
    };

    const handleSaveSingle = (updatedData: EventData) => {
        // Aggiorna solo lo stato locale dell'evento modificato
        setEvents(prev => prev.map(ev => ev === events[0] ? updatedData : ev));
        // Non cambiare tab, non mostrare lista eventi
    };

    return (
        <main className="min-h-screen p-8">
            <div className="max-w-6xl mx-auto space-y-8">
                <div className="text-center space-y-4">
                    <h1 className="text-4xl font-bold">Event Image Scanner</h1>
                    <p className="text-xl text-gray-600">
                        Carica l'immagine di un evento e lascia che l'AI estragga tutte le informazioni
                    </p>
                </div>

                {/* Tab Navigation */}
                <div className="flex justify-center">
                    <div className="bg-white rounded-lg shadow-md p-1">
                        <button
                            onClick={() => setActiveTab('upload')}
                            className={`px-6 py-2 rounded-md transition-colors ${activeTab === 'upload'
                                ? 'bg-blue-500 text-white'
                                : 'text-gray-600 hover:bg-gray-100'
                                }`}
                        >
                            Carica Evento
                        </button>
                        <button
                            onClick={() => setActiveTab('list')}
                            className={`px-6 py-2 rounded-md transition-colors ${activeTab === 'list'
                                ? 'bg-blue-500 text-white'
                                : 'text-gray-600 hover:bg-gray-100'
                                }`}
                        >
                            Eventi Salvati
                        </button>
                    </div>
                </div>

                {activeTab === 'upload' && (
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
                )}

                {activeTab === 'list' && <EventList />}
            </div>
        </main>
    );
}