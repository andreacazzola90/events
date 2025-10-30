'use client';

import { useState } from 'react';
import { EventData } from '../types/event';
import EventDisplay from './EventDisplay';

interface MultipleEventsEditorProps {
    events: EventData[];
    imageUrl?: string;
    onSaveAll: (events: EventData[]) => void;
}

export default function MultipleEventsEditor({ events: initialEvents, imageUrl, onSaveAll }: MultipleEventsEditorProps) {
    const [events, setEvents] = useState<EventData[]>(
        initialEvents.map(event => ({
            ...event,
            imageUrl: event.imageUrl || imageUrl || undefined
        }))
    );
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isSaving, setIsSaving] = useState(false);

    const handleEventUpdate = (index: number, updatedEvent: EventData) => {
        const newEvents = [...events];
        newEvents[index] = updatedEvent;
        setEvents(newEvents);
    };

    const handleDeleteEvent = (index: number) => {
        if (events.length === 1) {
            alert('Non puoi eliminare l\'ultimo evento');
            return;
        }
        const newEvents = events.filter((_, i) => i !== index);
        setEvents(newEvents);
        if (selectedIndex >= newEvents.length) {
            setSelectedIndex(newEvents.length - 1);
        }
    };

    const handleSaveAll = async () => {
        setIsSaving(true);
        try {
            await onSaveAll(events);
            alert(`${events.length} eventi salvati con successo!`);
        } catch (error) {
            console.error('Error saving events:', error);
            alert('Errore durante il salvataggio degli eventi');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h2 className="text-xl font-bold text-blue-900 mb-2">
                    🎉 {events.length} {events.length === 1 ? 'Evento trovato' : 'Eventi trovati'}!
                </h2>
                <p className="text-blue-700">
                    Modifica ciascun evento e poi salvali tutti insieme.
                </p>
            </div>

            {/* Event tabs */}
            <div className="flex flex-wrap gap-2">
                {events.map((event, index) => (
                    <button
                        key={index}
                        onClick={() => setSelectedIndex(index)}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${selectedIndex === index
                            ? 'bg-blue-500 text-white shadow-md'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                    >
                        Evento {index + 1}
                        {event.title && `: ${event.title.slice(0, 20)}${event.title.length > 20 ? '...' : ''}`}
                    </button>
                ))}
            </div>

            {/* Current event editor */}
            <div className="relative">
                <EventDisplay
                    eventData={events[selectedIndex]}
                    onSave={(updatedEvent) => handleEventUpdate(selectedIndex, updatedEvent)}
                />

                {/* Delete button */}
                {events.length > 1 && (
                    <button
                        onClick={() => handleDeleteEvent(selectedIndex)}
                        className="absolute top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
                    >
                        🗑️ Elimina questo evento
                    </button>
                )}
            </div>

            {/* Save all button + Export to Google Calendar */}
            <div className="flex flex-col md:flex-row justify-center items-center gap-4 pt-6">
                <button
                    onClick={handleSaveAll}
                    disabled={isSaving}
                    className={`px-8 py-4 text-lg font-bold rounded-lg transition-colors ${isSaving
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-green-500 hover:bg-green-600 text-white shadow-lg'
                        }`}
                >
                    {isSaving ? 'Salvataggio in corso...' : `💾 Salva tutti i ${events.length} eventi`}
                </button>
                <button
                    type="button"
                    className="px-8 py-4 text-lg font-bold rounded-lg bg-blue-500 hover:bg-blue-600 text-white shadow-lg"
                    onClick={() => {
                        events.forEach(ev => {
                            // Prepara parametri per Google Calendar con src custom
                            const [day, month, year] = (ev.date || '').split('/');
                            const [hour, minute] = (ev.time || '').split(':');
                            if (!year || !month || !day || !hour || !minute) return;
                            const startDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00`);
                            const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
                            const formatDate = (date: Date) => {
                                const y = date.getUTCFullYear();
                                const m = String(date.getUTCMonth() + 1).padStart(2, '0');
                                const d = String(date.getUTCDate()).padStart(2, '0');
                                const h = String(date.getUTCHours()).padStart(2, '0');
                                const min = String(date.getUTCMinutes()).padStart(2, '0');
                                const s = String(date.getUTCSeconds()).padStart(2, '0');
                                return `${y}${m}${d}T${h}${min}${s}Z`;
                            };
                            const start = formatDate(startDate);
                            const end = formatDate(endDate);
                            const params = new URLSearchParams({
                                action: 'TEMPLATE',
                                text: `[eventi] ${ev.title || 'Evento'}`,
                                dates: `${start}/${end}`,
                                details: ev.description || '',
                                location: ev.location || '',
                                src: 'e5cb20e460cb552770d0f59450103649bd2afc21a54c2b9e56990d4d93e7ac83@group.calendar.google.com'
                            });
                            const url = `https://calendar.google.com/calendar/render?${params.toString()}`;
                            window.open(url, '_blank', 'noopener,noreferrer');
                        });
                    }}
                >
                    📅 Esporta tutti su Google Calendar
                </button>
            </div>
        </div>
    );
}
