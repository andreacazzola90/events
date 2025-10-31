'use client';

import { EventData } from '@/types/event';
import { useState, useEffect, useRef } from 'react';

interface EventDisplayProps {
    eventData: EventData;
    onSave?: (updatedData: EventData) => void;
}

export default function EventDisplay({ eventData, onSave }: EventDisplayProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [copySuccess, setCopySuccess] = useState<'formatted' | 'raw' | null>(null);
    const [showOcr, setShowOcr] = useState(false);
    const [imageUrl, setImageUrl] = useState<string | undefined>(eventData.imageUrl);
    const formRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        setImageUrl(eventData.imageUrl);
    }, [eventData.imageUrl]);

    function EditableField({ label, field }: { label: string; field: keyof EventData }) {
        return (
            <div className="flex items-start space-x-4">
                <span className="text-gray-600 w-24 mt-2">{label}:</span>
                {isEditing ? (
                    <input
                        type="text"
                        name={field}
                        defaultValue={eventData[field] as string || ''}
                        className="flex-1 p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                ) : (
                    <span className="flex-1 py-2">{eventData[field] || ''}</span>
                )}
            </div>
        );
    }

    const handleSave = async () => {
        if (!formRef.current) return;
        const form = formRef.current;
        const updated: EventData = {
            ...eventData,
            title: (form.elements.namedItem('title') as HTMLInputElement)?.value || '',
            date: (form.elements.namedItem('date') as HTMLInputElement)?.value || '',
            time: (form.elements.namedItem('time') as HTMLInputElement)?.value || '',
            location: (form.elements.namedItem('location') as HTMLInputElement)?.value || '',
            category: (form.elements.namedItem('category') as HTMLInputElement)?.value || '',
            organizer: (form.elements.namedItem('organizer') as HTMLInputElement)?.value || '',
            price: (form.elements.namedItem('price') as HTMLInputElement)?.value || '',
            description: (form.elements.namedItem('description') as HTMLTextAreaElement)?.value || '',
            imageUrl: imageUrl,
            rawText: eventData.rawText
        };

        // If there's a new image file, we need to send it as FormData
        if (imageUrl && imageUrl.startsWith('blob:')) {
            try {
                const response = await fetch(imageUrl);
                const blob = await response.blob();
                const formData = new FormData();
                formData.append('eventData', JSON.stringify(updated));
                formData.append('image', blob, 'event-image.jpg');

                const saveResponse = await fetch('/api/events', {
                    method: 'POST',
                    body: formData,
                });

                if (saveResponse.ok) {
                    console.log('Event saved successfully');
                    // Refresh the page or update state as needed
                    window.location.reload();
                } else {
                    console.error('Failed to save event');
                }
            } catch (error) {
                console.error('Error saving event:', error);
            }
        } else {
            // No new image, use regular JSON save
            onSave?.(updated);
        }
        setIsEditing(false);
    };

    const copyToClipboard = async (text: string, type: 'formatted' | 'raw') => {
        try {
            await navigator.clipboard.writeText(text);
            setCopySuccess(type);
            setTimeout(() => setCopySuccess(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const getFormattedText = () => {
        return `
${eventData.title}

Data: ${eventData.date}
Ora: ${eventData.time}
Luogo: ${eventData.location}
${eventData.category ? `Categoria: ${eventData.category}\n` : ''}${eventData.organizer ? `Organizzatore: ${eventData.organizer}\n` : ''}${eventData.price ? `Prezzo: ${eventData.price}\n` : ''}
${eventData.description}
        `.trim();
    };

    const openGoogleCalendar = (event: EventData) => {
        console.log('Opening Google Calendar for event:', event);
        if (!event.date || !event.time) return;

        // Assume date format DD/MM/YYYY and time HH:MM
        const [day, month, year] = event.date.split('/');
        const [hour, minute] = event.time.split(':');

        const startDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00`);

        // Set end time to start + 1 hour (default duration)
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

        const formatDate = (date: Date): string => {
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            const hours = String(date.getUTCHours()).padStart(2, '0');
            const minutes = String(date.getUTCMinutes()).padStart(2, '0');
            const seconds = String(date.getUTCSeconds()).padStart(2, '0');
            return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
        };

        const start = formatDate(startDate);
        const end = formatDate(endDate);

        const params = new URLSearchParams({
            action: 'TEMPLATE',
            text: event.title || 'Evento',
            dates: `${start}/${end}`,
            details: event.description || '',
            location: event.location || '',
        });

        const url = `https://calendar.google.com/calendar/render?${params.toString()}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="space-y-6">
            <form ref={formRef} onSubmit={e => { e.preventDefault(); if (isEditing) handleSave(); }}>
                <div className="flex flex-row gap-8">
                    <div className="rounded-lg overflow-hidden shadow-lg min-w-[220px] max-w-[320px] shrink-0 flex flex-col items-center justify-center bg-white">
                        {imageUrl ? (
                            <img
                                src={imageUrl}
                                alt="Immagine evento"
                                className="w-full h-auto object-cover mb-2"
                            />
                        ) : (
                            <div className="w-full h-[220px] flex items-center justify-center text-gray-400">Nessuna immagine</div>
                        )}
                        {isEditing && (
                            <input
                                type="file"
                                accept="image/*"
                                className="mt-2 text-sm"
                                onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        const url = URL.createObjectURL(file);
                                        setImageUrl(url);
                                    }
                                }}
                            />
                        )}
                    </div>
                    <div className="flex-1 bg-linear-to-br from-white to-gray-50 rounded-lg shadow-md p-6">
                        <div className="flex justify-between items-center mb-4 gap-2">
                            <h2 className="text-2xl font-bold">
                                {isEditing ? (
                                    <input
                                        type="text"
                                        name="title"
                                        defaultValue={eventData.title}
                                        className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                ) : (
                                    eventData.title
                                )}
                            </h2>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isEditing) {
                                            handleSave();
                                        } else {
                                            setIsEditing(true);
                                        }
                                    }}
                                    className={`px-4 py-2 rounded transition-colors ${isEditing
                                        ? 'bg-green-500 hover:bg-green-600 text-white'
                                        : 'bg-blue-500 hover:bg-blue-600 text-white'
                                        }`}
                                >
                                    {isEditing ? 'Salva' : 'Modifica'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => openGoogleCalendar(eventData)}
                                    className="px-4 py-2 rounded bg-red-500 hover:bg-red-600 text-white transition-colors flex items-center"
                                    title="Aggiungi a Google Calendar"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    Salva nel calendario
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <EditableField label="Data" field="date" />
                            <EditableField label="Ora" field="time" />
                            <div className="flex items-start space-x-4">
                                <span className="text-gray-600 w-24 mt-2">Luogo:</span>
                                {isEditing ? (
                                    <input
                                        type="text"
                                        name="location"
                                        defaultValue={eventData.location || ''}
                                        className="flex-1 p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                ) : (
                                    <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(eventData.location || '')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 py-2 text-blue-600 hover:text-blue-800 underline"
                                    >
                                        {eventData.location || ''}
                                    </a>
                                )}
                            </div>
                            <EditableField label="Categoria" field="category" />
                            <EditableField label="Organizzatore" field="organizer" />
                            <EditableField label="Prezzo" field="price" />

                            <div className="flex items-start space-x-4">
                                <span className="text-gray-600 w-24 mt-2">Descrizione:</span>
                                {isEditing ? (
                                    <textarea
                                        name="description"
                                        defaultValue={eventData.description}
                                        className="flex-1 p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[100px]"
                                    />
                                ) : (
                                    <span className="flex-1 py-2">{eventData.description}</span>
                                )}
                            </div>
                        </div>

                        <div className="flex space-x-4 mt-4">
                            <button
                                type="button"
                                onClick={() => copyToClipboard(getFormattedText(), 'formatted')}
                                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                            >
                                {copySuccess === 'formatted' ? '✓ Copiato!' : 'Copia testo formattato'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowOcr(!showOcr)}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors flex items-center space-x-2"
                            >
                                <span>{showOcr ? 'Nascondi OCR' : 'Mostra OCR'}</span>
                                <svg
                                    className={`w-4 h-4 transition-transform ${showOcr ? 'transform rotate-180' : ''}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </form>

            {showOcr && (
                <div className="bg-gray-50 rounded-lg p-4 animate-fadeIn">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-sm font-medium text-gray-500">Testo OCR estratto:</h3>
                        <button
                            onClick={() => copyToClipboard(eventData.rawText, 'raw')}
                            className="text-sm text-blue-500 hover:text-blue-600"
                        >
                            {copySuccess === 'raw' ? '✓ Copiato!' : 'Copia'}
                        </button>
                    </div>
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap bg-white p-3 rounded border border-gray-200">
                        {eventData.rawText}
                    </pre>
                </div>
            )}
        </div>
    );
}