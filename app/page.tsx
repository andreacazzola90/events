'use client';

import { useState, useEffect } from 'react';
import ImageUploader from './components/ImageUploader';
import { EventData } from './types/event';
import EventDisplay from './components/EventDisplay';
import EventList from './components/EventList';

export default function Home() {
    const [eventData, setEventData] = useState<EventData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'upload' | 'list'>('upload');

    useEffect(() => {
        return () => {
            // Cleanup any object URLs when component unmounts
            if (eventData?.imageUrl) {
                URL.revokeObjectURL(eventData.imageUrl);
            }
        };
    }, []);

    const handleNewEventData = (data: EventData) => {
        // Cleanup previous image URL if it exists
        if (eventData?.imageUrl) {
            URL.revokeObjectURL(eventData.imageUrl);
        }
        setEventData(data);
        setError(null);
    };

    const handleSave = async (updatedData: EventData) => {
        setEventData(updatedData);
        try {
            // Check if there's an image URL that needs to be uploaded
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

                if (saveResponse.ok) {
                    console.log('Event saved successfully');
                } else {
                    console.error('Failed to save event');
                }
            } else {
                // No image upload needed, use regular JSON
                const response = await fetch('/api/events', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(updatedData),
                });

                if (response.ok) {
                    console.log('Event saved successfully');
                } else {
                    console.error('Failed to save event');
                }
            }
        } catch (error) {
            console.error('Error saving event:', error);
        }
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
                            onProcessed={handleNewEventData}
                            onError={(message: string) => {
                                setError(message);
                                setEventData(null);
                            }}
                        />

                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
                                {error}
                            </div>
                        )}

                        {eventData && <EventDisplay eventData={eventData} onSave={handleSave} />}
                    </div>
                )}

                {activeTab === 'list' && <EventList />}
            </div>
        </main>
    );
}