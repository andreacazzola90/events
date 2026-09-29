
'use client';

import { DuplicateMatch, EventData } from '../types/event';
import { AlertIcon, CalendarIcon, ClockIcon, LinkIcon, MapPinIcon, MegaphoneIcon, TagIcon, TextIcon, TicketIcon } from './EventIcons';
import { STANDARD_CATEGORIES } from '../../lib/constants';
import { normalizeCategory, normalizePrice } from '../../lib/event-utils';
import { useState, useEffect, useRef, type ReactNode } from 'react';
import SaveAnimation from './SaveAnimation';
import { toast } from 'react-toastify';

interface EventDisplayProps {
    eventData: EventData;
    onSave?: (updatedData: EventData) => void;
    duplicate?: DuplicateMatch | null;
}

const isMissing = (value?: string) => !value || !value.trim() || /^non trovato$/i.test(value.trim());

function formatDateLong(raw?: string): string {
    if (!raw) return '';
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const dmy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : dmy ? [dmy[3], dmy[2], dmy[1]] : [];
    if (!y) return raw;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const inputClass = 'w-full bg-white border border-black/20 px-3 py-2 text-[#1d1d1b] focus:outline-none focus:border-[#d65a38] transition-colors';

export default function EventDisplay({ eventData, onSave, duplicate }: EventDisplayProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [imageUrl, setImageUrl] = useState<string | undefined>(eventData.imageUrl);
    const [saveAnimationStatus, setSaveAnimationStatus] = useState<'saving' | 'success' | 'hidden'>('hidden');
    const [isSaving, setIsSaving] = useState(false);
    const formRef = useRef<HTMLFormElement>(null);

    const handleSaveApiError = (errorText: string): never => {
        let parsedError: any;

        try {
            parsedError = JSON.parse(errorText);
        } catch {
            parsedError = null;
        }

        if (parsedError?.error === 'EVENT_DUPLICATE') {
            toast.info(parsedError.message || 'Questo evento è già stato creato.');
            throw new Error('EVENT_DUPLICATE');
        }

        throw new Error('Failed to save event: ' + errorText);
    };

    useEffect(() => {
        setImageUrl(eventData.imageUrl);
    }, [eventData.imageUrl]);

    const missingValue = <span className="text-[#b84b2d] italic font-medium">Da completare</span>;

    const renderInput = (field: keyof EventData, placeholder?: string) => (
        <>
            <input
                type="text"
                name={field}
                list={field === 'category' ? 'category-suggestions' : undefined}
                defaultValue={isMissing(eventData[field] as string) ? '' : (eventData[field] as string)}
                placeholder={placeholder}
                className={`field-input field-${field}-input ${inputClass}`}
            />
            {field === 'category' && (
                <datalist id="category-suggestions">
                    {STANDARD_CATEGORIES.map(cat => (
                        <option key={cat} value={cat} />
                    ))}
                </datalist>
            )}
        </>
    );

    /** Big tile for the key facts (date, time, place). */
    const renderKeyFact = (field: 'date' | 'time' | 'location', label: string, icon: ReactNode, display: ReactNode, placeholder: string) => (
        <div className={`event-key-fact field-${field} bg-white p-4 flex items-start gap-3 min-w-0`}>
            <span className="shrink-0 text-[#d65a38] mt-0.5">{icon}</span>
            <div className="min-w-0 flex-1">
                <p className="section-kicker mb-1">{label}</p>
                {isEditing
                    ? renderInput(field, placeholder)
                    : <div className="text-lg font-bold leading-snug text-[#1d1d1b] wrap-break-word">{isMissing(eventData[field]) ? missingValue : display}</div>}
            </div>
        </div>
    );

    /** Compact row for secondary details. */
    const renderDetailRow = (field: keyof EventData, label: string, icon: ReactNode, display?: ReactNode, placeholder?: string) => (
        <div className={`event-detail-row field-${field} flex items-start gap-3 py-3 border-b border-black/10 last:border-b-0`}>
            <span className="shrink-0 text-[#5f5b56] mt-0.5">{icon}</span>
            <span className="w-28 shrink-0 text-sm text-[#5f5b56] mt-0.5">{label}</span>
            <div className="flex-1 min-w-0 text-[#1d1d1b] wrap-break-word">
                {isEditing
                    ? renderInput(field, placeholder)
                    : isMissing(eventData[field] as string) ? missingValue : (display ?? (eventData[field] as string))}
            </div>
        </div>
    );

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
            sourceUrl: (form.elements.namedItem('sourceUrl') as HTMLInputElement)?.value || eventData.sourceUrl,
            rawText: eventData.rawText
        };

        if (onSave) {
            // Chiama la callback del padre (usato in modalità editing)
            onSave(updated);
            setIsEditing(false);
        }
    };

    const handleAddEvent = async () => {
        setIsSaving(true);
        setSaveAnimationStatus('saving');

        try {
            // Se non siamo in editing, usa direttamente eventData
            // Se siamo in editing, leggi dal form
            let eventToSave: EventData;

            if (isEditing && formRef.current) {
                const form = formRef.current;
                eventToSave = {
                    ...eventData,
                    title: (form.elements.namedItem('title') as HTMLInputElement)?.value || eventData.title,
                    date: (form.elements.namedItem('date') as HTMLInputElement)?.value || eventData.date,
                    time: (form.elements.namedItem('time') as HTMLInputElement)?.value || eventData.time,
                    location: (form.elements.namedItem('location') as HTMLInputElement)?.value || eventData.location,
                    category: (form.elements.namedItem('category') as HTMLInputElement)?.value || eventData.category,
                    organizer: (form.elements.namedItem('organizer') as HTMLInputElement)?.value || eventData.organizer,
                    price: (form.elements.namedItem('price') as HTMLInputElement)?.value || eventData.price,
                    description: (form.elements.namedItem('description') as HTMLTextAreaElement)?.value || eventData.description,
                    imageUrl: imageUrl,
                    sourceUrl: (form.elements.namedItem('sourceUrl') as HTMLInputElement)?.value || eventData.sourceUrl,
                    rawText: eventData.rawText
                };
            } else {
                // Non in editing, usa i dati esistenti
                eventToSave = {
                    ...eventData,
                    imageUrl: imageUrl,
                };
            }

            // Normalizza i dati prima del salvataggio
            eventToSave.category = normalizeCategory(eventToSave.category);
            eventToSave.price = normalizePrice(eventToSave.price);

            console.log('[EventDisplay] Saving event:', eventToSave);

            let savedEvent;

            // Salva l'evento sul database
            if (eventToSave.imageUrl && eventToSave.imageUrl.startsWith('blob:')) {
                const response = await fetch(eventToSave.imageUrl);
                const blob = await response.blob();
                const formData = new FormData();
                formData.append('eventData', JSON.stringify(eventToSave));
                formData.append('image', blob, 'event-image.jpg');

                const saveResponse = await fetch('/api/events', {
                    method: 'POST',
                    body: formData,
                });

                if (!saveResponse.ok) {
                    const errorText = await saveResponse.text();
                    console.error('[EventDisplay] Save failed:', errorText);
                    handleSaveApiError(errorText);
                }

                savedEvent = await saveResponse.json();
            } else {
                // No image upload needed, use regular JSON
                const response = await fetch('/api/events', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(eventToSave),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('[EventDisplay] Save failed:', errorText);
                    handleSaveApiError(errorText);
                }

                savedEvent = await response.json();
            }

            console.log('[EventDisplay] Event saved successfully, ID:', savedEvent.id);
            setSaveAnimationStatus('success');

            // Clear service worker cache
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                console.log('[EventDisplay] Sending CLEAR_CACHE message to service worker');
                navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            // Wait for animation to complete
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Redirect to new event detail page when available
            if (savedEvent?.slug) {
                console.log('[EventDisplay] Redirecting to event detail page:', savedEvent.slug);
                window.location.href = `/events/${savedEvent.slug}`;
            } else {
                console.log('[EventDisplay] Redirecting to homepage');
                window.location.href = '/?refresh=' + Date.now();
            }
        } catch (error) {
            console.error('[EventDisplay] Error saving event:', error);
            if (error instanceof Error && error.message === 'EVENT_DUPLICATE') {
                setSaveAnimationStatus('hidden');
                setIsSaving(false);
                return;
            }
            alert('Errore nel salvataggio dell\'evento: ' + (error instanceof Error ? error.message : 'Unknown error'));
            setSaveAnimationStatus('hidden');
            setIsSaving(false);
        }
    };
    const hasTime = isEditing || !isMissing(eventData.time);
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(eventData.location || '')}`;

    return (
        <div className="event-display-container space-y-6">
            {duplicate && (
                <div role="alert" className="event-duplicate-alert flex items-start gap-4 border border-[#d65a38]/50 bg-[#fff7f4] p-5">
                    <AlertIcon className="w-6 h-6 shrink-0 text-[#b84b2d] mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-[#8f3823] mb-1">Questo evento esiste già</p>
                        <p className="text-sm text-[#5f5b56] mb-3">
                            “{duplicate.title}” · {formatDateLong(duplicate.date)}
                            {duplicate.location && !isMissing(duplicate.location) ? ` · ${duplicate.location}` : ''}.
                            {' '}Non è possibile pubblicarlo di nuovo.
                        </p>
                        <a href={`/events/${duplicate.slug}`} className="industrial-link industrial-link-outline">
                            Vai all’evento esistente <span aria-hidden="true">→</span>
                        </a>
                    </div>
                </div>
            )}

            <form ref={formRef} onSubmit={e => { e.preventDefault(); if (isEditing) handleSave(); }} className="event-form">
                <div className="event-main-layout grid gap-6 md:gap-8 md:grid-cols-[minmax(0,320px)_1fr] items-start">
                    <div className="event-image-section surface-panel overflow-hidden md:sticky md:top-24">
                        {imageUrl ? (
                            <img
                                src={imageUrl}
                                alt="Locandina evento"
                                className="event-image w-full h-auto object-cover"
                            />
                        ) : (
                            <div className="event-image-placeholder w-full h-55 flex items-center justify-center text-[#5f5b56]">Nessuna immagine</div>
                        )}
                        {isEditing && (
                            <label className="block p-4 border-t border-black/10 text-sm text-[#5f5b56]">
                                Cambia immagine
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="event-image-upload mt-2 text-sm w-full"
                                    onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const url = URL.createObjectURL(file);
                                            setImageUrl(url);
                                        }
                                    }}
                                />
                            </label>
                        )}
                    </div>

                    <div className="event-details-section surface-panel p-5 md:p-8 text-[#1d1d1b] space-y-6 min-w-0">
                        <header className="event-header space-y-3">
                            {isEditing ? (
                                <label className="flex items-center gap-2 text-sm text-[#5f5b56]">
                                    <TagIcon className="w-4 h-4 shrink-0" />
                                    <span className="shrink-0">Categoria</span>
                                    {renderInput('category')}
                                </label>
                            ) : !isMissing(eventData.category) && (
                                <span className="event-category inline-flex items-center gap-1.5 bg-[#f4d9d3] text-[#8f3823] px-3 py-1 text-xs font-bold uppercase tracking-wider">
                                    <TagIcon className="w-3.5 h-3.5" />
                                    {eventData.category}
                                </span>
                            )}
                            <h2 className="event-title text-3xl md:text-4xl font-black leading-tight tracking-tight">
                                {isEditing ? (
                                    <input
                                        type="text"
                                        name="title"
                                        defaultValue={eventData.title}
                                        className={`event-title-input ${inputClass} text-2xl font-black`}
                                    />
                                ) : (
                                    isMissing(eventData.title) ? missingValue : eventData.title
                                )}
                            </h2>
                        </header>

                        <div className={`event-key-facts grid gap-px bg-black/10 border border-black/10 ${hasTime ? 'sm:grid-cols-[1.2fr_0.8fr]' : ''}`}>
                            {renderKeyFact('date', 'Quando', <CalendarIcon className="w-6 h-6" />, <span className="first-letter:uppercase">{formatDateLong(eventData.date)}</span>, 'GG/MM/AAAA')}
                            {hasTime && renderKeyFact('time', 'Ora', <ClockIcon className="w-6 h-6" />, eventData.time, 'HH:MM')}
                            <div className={hasTime ? 'sm:col-span-2' : ''}>
                                {renderKeyFact(
                                    'location',
                                    'Dove',
                                    <MapPinIcon className="w-6 h-6" />,
                                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="event-location-link underline decoration-[#d65a38]/40 underline-offset-4 hover:decoration-[#d65a38]">
                                        {eventData.location}
                                    </a>,
                                    'Luogo, indirizzo, città',
                                )}
                            </div>
                        </div>

                        <div className="event-secondary-details">
                            {renderDetailRow('organizer', 'Organizzatore', <MegaphoneIcon className="w-5 h-5" />)}
                            {renderDetailRow('price', 'Ingresso', <TicketIcon className="w-5 h-5" />)}
                            {renderDetailRow(
                                'sourceUrl',
                                'Link',
                                <LinkIcon className="w-5 h-5" />,
                                eventData.sourceUrl && /^https?:\/\//i.test(eventData.sourceUrl) ? (
                                    <a
                                        href={eventData.sourceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="event-source-link text-[#b84b2d] underline underline-offset-4 break-all"
                                    >
                                        {eventData.sourceUrl.replace(/^https?:\/\/(www\.)?/, '')}
                                    </a>
                                ) : eventData.sourceUrl,
                                'https://...',
                            )}
                        </div>

                        <div className="event-field-description">
                            <p className="section-kicker mb-2 flex items-center gap-2">
                                <TextIcon className="w-4 h-4" /> Descrizione
                            </p>
                            {isEditing ? (
                                <textarea
                                    name="description"
                                    defaultValue={isMissing(eventData.description) ? '' : eventData.description}
                                    className={`event-description-textarea ${inputClass} min-h-40`}
                                />
                            ) : isMissing(eventData.description) ? missingValue : (
                                <p className="event-description-text whitespace-pre-line leading-relaxed text-[#2b2a28] mb-0">{eventData.description}</p>
                            )}
                        </div>

                        <div className="event-actions flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t border-black/10">
                            <button
                                type="button"
                                onClick={() => {
                                    if (isEditing) {
                                        handleSave();
                                    } else {
                                        setIsEditing(true);
                                    }
                                }}
                                disabled={isSaving}
                                className="event-edit-save-button btn btn-outline disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isEditing ? 'Salva modifiche' : 'Modifica dettagli'}
                            </button>
                            {!isEditing && (
                                <button
                                    type="button"
                                    onClick={handleAddEvent}
                                    disabled={isSaving || !!duplicate}
                                    title={duplicate ? 'Questo evento esiste già' : undefined}
                                    className="event-add-button btn btn-primary sm:ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSaving ? 'Pubblicazione…' : duplicate ? 'Evento già presente' : 'Pubblica evento'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </form>

            {/* SaveAnimation overlay */}
            <SaveAnimation
                status={saveAnimationStatus}
                onComplete={() => setSaveAnimationStatus('hidden')}
            />
        </div>
    );
}