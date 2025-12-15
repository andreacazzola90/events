
'use client';

// Helper to open Google Calendar with event data
function openGoogleCalendar(event: EventData) {
    // Format date: DD/MM/YYYY or YYYY-MM-DD to YYYYMMDD
    let startDate = event.date;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(startDate)) {
        const [d, m, y] = startDate.split('/');
        startDate = `${y}${m}${d}`;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        startDate = startDate.replace(/-/g, '');
    }
    // Format time: HH:MM to HHMM
    let startTime = event.time ? event.time.replace(':', '') : '0000';
    // Default duration: 2 hours
    let endTime = (parseInt(startTime) + 200).toString().padStart(4, '0');
    // If time overflows, just add 2 hours (not robust for 24h wrap)
    const start = `${startDate}T${startTime}00`;
    const end = `${startDate}T${endTime}00`;
    const details = encodeURIComponent(event.description || '');
    const location = encodeURIComponent(event.location || '');
    const title = encodeURIComponent(event.title || 'Evento');
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&location=${location}`;
    window.open(url, '_blank');
}

import { EventData } from '@/types/event';
import { CalendarIcon, ClockIcon, MapPinIcon } from './EventIcons';
const CategoryIcon = (props: any) => <svg {...props} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M8 8h.01M16 8h.01M8 16h.01M16 16h.01" /></svg>;
const UserIcon = (props: any) => <svg {...props} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-7 8-7s8 3 8 7" /></svg>;
const PriceIcon = (props: any) => <svg {...props} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M12 8v8m0 0a4 4 0 1 1 0-8 4 4 0 1 1 0 8zm0 0h4m-4 0H8" /></svg>;
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
        let icon = null;
        if (field === 'date') icon = <CalendarIcon className="field-icon date-icon w-5 h-5 text-blue-500" />;
        if (field === 'time') icon = <ClockIcon className="field-icon time-icon w-5 h-5 text-blue-500" />;
        if (field === 'location') icon = <MapPinIcon className="field-icon location-icon w-5 h-5 text-blue-500" />;
        if (field === 'category') icon = <CategoryIcon className="field-icon category-icon w-5 h-5 text-blue-500" />;
        if (field === 'organizer') icon = <UserIcon className="field-icon organizer-icon w-5 h-5 text-blue-500" />;
        if (field === 'price') icon = <PriceIcon className="field-icon price-icon w-5 h-5 text-blue-500" />;
        return (
            <div className={`editable-field field-${field} flex items-start space-x-4`}>
                {icon && <span className="field-icon-wrapper mt-2">{icon}</span>}
                {!icon && <span className="field-label text-gray-600 w-24 mt-2">{label}:</span>}
                {isEditing ? (
                    <input
                        type="text"
                        name={field}
                        defaultValue={eventData[field] as string || ''}
                        className={`field-input field-${field}-input flex-1 p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                    />
                ) : (
                    <span className={`field-display field-${field}-display flex-1 py-2`}>{eventData[field] || ''}</span>
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
        onSave?.(updated);
        setIsEditing(false);
    };
    return (
        <div className="event-display-container space-y-6">
            <form ref={formRef} onSubmit={e => { e.preventDefault(); if (isEditing) handleSave(); }} className="event-form">
                <div className="event-main-layout flex flex-row gap-8">
                    <div className="event-image-section rounded-lg overflow-hidden shadow-lg min-w-[220px] max-w-[320px] shrink-0 flex flex-col items-center justify-center bg-white">
                        {imageUrl ? (
                            <img
                                src={imageUrl}
                                alt="Immagine evento"
                                className="event-image w-full h-auto object-cover mb-2"
                            />
                        ) : (
                            <div className="event-image-placeholder w-full h-[220px] flex items-center justify-center text-gray-400">Nessuna immagine</div>
                        )}
                        {isEditing && (
                            <input
                                type="file"
                                accept="image/*"
                                className="event-image-upload mt-2 text-sm"
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
                    <div className="event-details-section text-black flex-1 bg-linear-to-br from-white to-gray-50 rounded-lg shadow-md p-6">
                        <div className="event-header flex justify-between items-center mb-4 gap-2">
                            <h2 className="event-title text-2xl font-bold">
                                {isEditing ? (
                                    <input
                                        type="text"
                                        name="title"
                                        defaultValue={eventData.title}
                                        className="event-title-input w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                ) : (
                                    eventData.title
                                )}
                            </h2>
                            <div className="event-actions flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isEditing) {
                                            handleSave();
                                        } else {
                                            setIsEditing(true);
                                        }
                                    }}
                                    className={`event-edit-save-button px-4 py-2 rounded-full font-bold shadow-button transition-all duration-200 text-white ${isEditing
                                        ? 'bg-linear-to-r from-green-400 via-green-500 to-green-600 hover:from-green-500 hover:to-green-700'
                                        : 'bg-linear-to-r from-primary via-accent to-secondary hover:from-pink-600 hover:to-yellow-400'
                                        }`}
                                >
                                    {isEditing ? 'Salva' : 'Modifica'}
                                </button>
                                {/* Pulsante aggiungi evento: salva solo su DB */}
                                {!isEditing && (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            // Salva su DB
                                            if (imageUrl && imageUrl.startsWith('blob:')) {
                                                try {
                                                    const response = await fetch(imageUrl);
                                                    const blob = await response.blob();
                                                    const formData = new FormData();
                                                    formData.append('eventData', JSON.stringify(eventData));
                                                    formData.append('image', blob, 'event-image.jpg');
                                                    const saveResponse = await fetch('/api/events', {
                                                        method: 'POST',
                                                        body: formData,
                                                    });
                                                    if (saveResponse.ok) {
                                                        alert('Evento aggiunto al database!');
                                                    } else {
                                                        alert('Errore nel salvataggio evento.');
                                                    }
                                                } catch (error) {
                                                    alert('Errore nel salvataggio evento.');
                                                }
                                            } else {
                                                // No new image, use regular JSON
                                                try {
                                                    console.log('[EventDisplay] Saving event with JSON:', eventData);
                                                    const saveResponse = await fetch('/api/events', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify(eventData),
                                                    });
                                                    console.log('[EventDisplay] Save response status:', saveResponse.status);

                                                    if (saveResponse.ok) {
                                                        alert('Evento aggiunto al database!');
                                                    } else {
                                                        const responseText = await saveResponse.text();
                                                        console.error('[EventDisplay] Save failed, response text:', responseText);

                                                        let errorData;
                                                        try {
                                                            errorData = JSON.parse(responseText);
                                                        } catch {
                                                            errorData = { error: 'Invalid JSON response', text: responseText };
                                                        }

                                                        console.error('[EventDisplay] Save failed, parsed error:', errorData);
                                                        alert('Errore nel salvataggio evento: ' + (errorData.details || errorData.error || 'Errore sconosciuto'));
                                                    }
                                                } catch (error) {
                                                    console.error('[EventDisplay] Save error:', error);
                                                    alert('Errore nel salvataggio evento.');
                                                }
                                            }
                                        }}
                                        className="event-add-button px-4 py-2 rounded-full font-bold shadow-button bg-blue-500 hover:bg-blue-600 text-white transition-all"
                                    >
                                        Aggiungi evento
                                    </button>
                                )}
                                {/* Pulsante aggiungi a calendario: salva su DB e poi apre Google Calendar */}
                                {!isEditing && (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            // Salva su DB
                                            let saveOk = false;
                                            if (imageUrl && imageUrl.startsWith('blob:')) {
                                                try {
                                                    const response = await fetch(imageUrl);
                                                    const blob = await response.blob();
                                                    const formData = new FormData();
                                                    formData.append('eventData', JSON.stringify(eventData));
                                                    formData.append('image', blob, 'event-image.jpg');
                                                    const saveResponse = await fetch('/api/events', {
                                                        method: 'POST',
                                                        body: formData,
                                                    });
                                                    saveOk = saveResponse.ok;
                                                } catch (error) {
                                                    saveOk = false;
                                                }
                                            } else {
                                                try {
                                                    console.log('[EventDisplay Calendar] Saving event with JSON:', eventData);
                                                    const saveResponse = await fetch('/api/events', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify(eventData),
                                                    });
                                                    console.log('[EventDisplay Calendar] Save response status:', saveResponse.status);
                                                    saveOk = saveResponse.ok;

                                                    if (!saveOk) {
                                                        const responseText = await saveResponse.text();
                                                        console.error('[EventDisplay Calendar] Save failed, response:', responseText);

                                                        try {
                                                            const errorData = JSON.parse(responseText);
                                                            console.error('[EventDisplay Calendar] Error details:', errorData);
                                                        } catch {
                                                            console.error('[EventDisplay Calendar] Could not parse error response');
                                                        }
                                                    }
                                                } catch (error) {
                                                    console.error('[EventDisplay Calendar] Save error:', error);
                                                    saveOk = false;
                                                }
                                            }
                                            if (saveOk) {
                                                openGoogleCalendar(eventData);
                                            } else {
                                                alert('Errore nel salvataggio evento.');
                                            }
                                        }}
                                        className="event-calendar-button px-4 py-2 rounded-full font-bold shadow-button bg-linear-to-r from-red-500 via-pink-500 to-yellow-400 hover:from-red-600 hover:to-yellow-500 text-white transition-all flex items-center"
                                        title="Aggiungi a Google Calendar"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="calendar-icon w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        Salva nel calendario
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="event-fields-container space-y-3">
                            <div className="event-field-date">
                                <EditableField label="Data" field="date" />
                            </div>
                            <div className="event-field-time">
                                <EditableField label="Ora" field="time" />
                            </div>
                            <div className="event-field-location flex items-start space-x-4">
                                <MapPinIcon className="location-icon w-5 h-5 text-blue-500 mt-2" />
                                {isEditing ? (
                                    <input
                                        type="text"
                                        name="location"
                                        defaultValue={eventData.location || ''}
                                        className="event-location-input flex-1 p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                ) : (
                                    <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(eventData.location || '')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="event-location-link flex-1 py-2 text-blue-600 hover:text-blue-800 underline"
                                    >
                                        {eventData.location || ''}
                                    </a>
                                )}
                            </div>
                            <div className="event-field-category">
                                <EditableField label="Categoria" field="category" />
                            </div>
                            <div className="event-field-organizer">
                                <EditableField label="Organizzatore" field="organizer" />
                            </div>
                            <div className="event-field-price">
                                <EditableField label="Prezzo" field="price" />
                            </div>
                            <div className="event-field-description flex items-start space-x-4">
                                <span className="description-label text-gray-600 w-24 mt-2">Descrizione:</span>
                                {isEditing ? (
                                    <textarea
                                        name="description"
                                        defaultValue={eventData.description}
                                        className="event-description-textarea flex-1 p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[100px]"
                                    />
                                ) : (
                                    <span className="event-description-text flex-1 py-2">{eventData.description}</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
}