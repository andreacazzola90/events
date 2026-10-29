
'use client';

import { type Area } from 'react-easy-crop';
import EventImageCropper from './EventImageCropper';
import EventCoverPicker from './EventCoverPicker';
import { DuplicateMatch, EventData } from '../types/event';
import { AlertIcon, CalendarIcon, ClockIcon, LinkIcon, MapPinIcon, MegaphoneIcon, TagIcon, TextIcon, TicketIcon } from './EventIcons';
import { STANDARD_CATEGORIES } from '../../lib/constants';
import EventCategoryBadge from './EventCategoryBadge';
import { normalizeCategory, normalizePrice } from '../../lib/event-utils';
import { useState, useEffect, useRef, type ReactNode } from 'react';
import { getCropOutputSize, MAX_EVENT_MEDIA_BYTES } from '../../lib/event-media';
import { MAX_AI_INSTRUCTIONS_LENGTH } from '../../lib/ai-instructions';
import SaveAnimation from './SaveAnimation';
import { toast } from 'react-toastify';
import { CheckCircle2, CircleAlert, Crop, Loader2 } from 'lucide-react';
import { DRAFT_CROP_FAILURE_MESSAGES, prepareDraftForPublication, type DraftImageCropFailure, type DraftImageCropStatus } from '../../lib/draft-image-crop';

async function cropCoverToFile(imageSource: string, area: Area) {
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    image.src = imageSource;
    await image.decode();
    const outputSize = getCropOutputSize(area.width, area.height);
    const canvas = document.createElement('canvas');
    canvas.width = outputSize.width;
    canvas.height = outputSize.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Impossibile ritagliare l’immagine');
    context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, outputSize.width, outputSize.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('Impossibile esportare l’immagine')), 'image/jpeg', 0.82);
    });
    if (blob.size > MAX_EVENT_MEDIA_BYTES) throw new Error('Il ritaglio supera 4 MiB');
    return new File([blob], `cover-${Date.now()}.jpg`, { type: 'image/jpeg' });
}

interface EventDisplayProps {
    eventData: EventData;
    onSave?: (updatedData: EventData) => void;
    duplicate?: DuplicateMatch | null;
    showPublishButton?: boolean;
    imageProcessing?: boolean;
    imageCropStatus?: DraftImageCropStatus;
    imageCropFailure?: DraftImageCropFailure;
    onImageChange?: (imageUrl: string, originalImageUrl?: string) => void;
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

export default function EventDisplay({ eventData, onSave, duplicate, showPublishButton = true, imageProcessing = false, imageCropStatus = imageProcessing ? 'processing' : 'idle', imageCropFailure, onImageChange }: EventDisplayProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [imageUrl, setImageUrl] = useState<string | undefined>(eventData.imageUrl);
    const [cropSource, setCropSource] = useState<string | null>(null);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [saveAnimationStatus, setSaveAnimationStatus] = useState<'saving' | 'success' | 'hidden'>('hidden');
    const [isSaving, setIsSaving] = useState(false);
    const [aiInstructions, setAiInstructions] = useState('');
    const [isReprocessing, setIsReprocessing] = useState(false);
    const [reprocessMessage, setReprocessMessage] = useState('');
    const [reprocessError, setReprocessError] = useState('');
    const formRef = useRef<HTMLFormElement>(null);
    const cropPreviewUrls = useRef<string[]>([]);
    const originalCropSource = useRef(eventData.originalImageUrl || eventData.imageUrl);
    const [manualImageOverride, setManualImageOverride] = useState(false);
    const [webImageOverride, setWebImageOverride] = useState(false);
    const draftImageSource = useRef(eventData.originalImageUrl || eventData.imageUrl);
    const currentImageUrl = useRef(eventData.imageUrl);
    const currentOnSave = useRef(onSave);
    useEffect(() => { currentOnSave.current = onSave; }, [onSave]);

    useEffect(() => () => cropPreviewUrls.current.forEach(url => URL.revokeObjectURL(url)), []);

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
        const source = eventData.originalImageUrl || eventData.imageUrl;
        const newDraft = draftImageSource.current !== source;
        if (newDraft) {
            setManualImageOverride(false);
            setWebImageOverride(false);
        }
        draftImageSource.current = source;
        if (newDraft || !manualImageOverride) {
            currentImageUrl.current = eventData.imageUrl;
            setImageUrl(eventData.imageUrl);
            originalCropSource.current = source;
        }
    }, [eventData.imageUrl, eventData.originalImageUrl, manualImageOverride]);

    const handleOpenCropper = (source = imageUrl) => {
        if (!source) return;
        setCropSource(source);
        setCroppedAreaPixels(null);
    };

    const handleApplyCrop = async () => {
        if (!cropSource || !croppedAreaPixels) return;
        try {
            const croppedFile = await cropCoverToFile(cropSource, croppedAreaPixels);
            const previewUrl = URL.createObjectURL(croppedFile);
            cropPreviewUrls.current.push(previewUrl);
            setManualImageOverride(true);
            setWebImageOverride(false);
            setImageUrl(previewUrl);
            currentImageUrl.current = previewUrl;
            onImageChange?.(previewUrl, originalCropSource.current);
            setCropSource(null);
        } catch {
            toast.error('Impossibile ritagliare l’immagine o il ritaglio supera il limite di 4 MiB.');
        }
    };

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

    const getEditedEvent = (): EventData | null => {
        if (!formRef.current) return null;
        const form = formRef.current;
        const readValue = (name: string) =>
            (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null)?.value || '';

        return {
            ...eventData,
            title: readValue('title'),
            date: readValue('date'),
            time: readValue('time'),
            location: readValue('location'),
            category: readValue('category'),
            organizer: readValue('organizer'),
            price: readValue('price'),
            description: readValue('description'),
            imageUrl: currentImageUrl.current,
            originalImageUrl: originalCropSource.current,
            sourceUrl: readValue('sourceUrl') || eventData.sourceUrl,
            rawText: eventData.rawText,
        };
    };

    const handleSave = async () => {
        const updated = getEditedEvent();
        if (!updated) return;

        if (onSave) {
            // Chiama la callback del padre (usato in modalità editing)
            onSave(updated);
            setIsEditing(false);
        }
    };

    const handleReprocessWithAi = async () => {
        const currentEvent = getEditedEvent();
        if (!currentEvent || !onSave || !aiInstructions.trim()) return;
        const submittedInstructions = aiInstructions;

        setIsReprocessing(true);
        setReprocessError('');
        setReprocessMessage('');
        try {
            const response = await fetch('/api/ai/reprocess-event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event: currentEvent, aiInstructions }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.event) {
                throw new Error(payload.error || 'Impossibile rielaborare l’evento.');
            }

            const latestEvent = getEditedEvent();
            if (
                !latestEvent ||
                JSON.stringify(latestEvent) !== JSON.stringify(currentEvent) ||
                aiInstructions !== submittedInstructions
            ) {
                setReprocessError('La bozza o le istruzioni sono cambiate durante la rielaborazione. Riprova per applicare il nuovo testo.');
                return;
            }

            const updatedEvent = { ...payload.event, originalImageUrl: currentEvent.originalImageUrl } as EventData;
            const form = formRef.current;
            const fields = ['title', 'date', 'time', 'location', 'category', 'organizer', 'price', 'description', 'sourceUrl'] as const;
            fields.forEach((field) => {
                const input = form?.elements.namedItem(field) as HTMLInputElement | HTMLTextAreaElement | null;
                if (input) input.value = updatedEvent[field] || '';
            });
            setImageUrl(updatedEvent.imageUrl);
            currentImageUrl.current = updatedEvent.imageUrl;
            currentOnSave.current?.(updatedEvent);
            setReprocessMessage('Bozza aggiornata dall’AI. Controlla i campi e salva le modifiche.');
        } catch (error) {
            setReprocessError(error instanceof Error ? error.message : 'Impossibile rielaborare l’evento.');
        } finally {
            setIsReprocessing(false);
        }
    };

    const handleAddEvent = async () => {
        if (imageProcessing) return;
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
            eventToSave = prepareDraftForPublication(eventToSave);

            console.log('[EventDisplay] Saving event:', eventToSave);

            let savedEvent;

            // Salva l'evento sul database
            if (eventToSave.imageUrl && eventToSave.imageUrl.startsWith('blob:')) {
                const response = await fetch(eventToSave.imageUrl);
                const blob = await response.blob();
                const formData = new FormData();
                formData.append('eventData', JSON.stringify(eventToSave));
                formData.append('image', blob, `event-image.${blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'}`);

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
                    <div className={`event-image-section surface-panel overflow-hidden ${imageCropStatus === 'failed' ? '' : 'md:sticky md:top-24'}`}>
                        {(imageCropStatus !== 'idle' || manualImageOverride) && (
                            <div
                                role="status"
                                aria-live="polite"
                                aria-atomic="true"
                                data-image-crop-status={manualImageOverride ? webImageOverride ? 'web' : 'manual' : imageCropStatus}
                                className={`flex items-start gap-2 border-b border-black/10 px-4 py-3 text-sm ${manualImageOverride ? 'bg-white text-[#5f5b56]' : imageCropStatus === 'failed' ? 'bg-[#fff7f4] text-[#8f3823]' : imageCropStatus === 'completed' ? 'bg-green-50 text-green-800' : 'bg-white text-[#5f5b56]'}`}
                            >
                                {!manualImageOverride && imageCropStatus === 'processing'
                                    ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                                    : !manualImageOverride && imageCropStatus === 'failed'
                                        ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                        : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
                                <div className="min-w-0">
                                    <span className="block font-semibold">{manualImageOverride
                                        ? webImageOverride ? 'Immagine scelta dal web' : 'Immagine modificata manualmente'
                                        : imageCropStatus === 'processing' ? 'Immagine in elaborazione'
                                            : imageCropStatus === 'completed' ? 'Ritaglio completato' : 'Ritaglio non riuscito'}</span>
                                    {!manualImageOverride && imageCropStatus === 'failed' && (
                                        <span className="mt-1 block">{imageCropFailure && DRAFT_CROP_FAILURE_MESSAGES[imageCropFailure]}{imageCropFailure ? ' ' : ''}Puoi ritagliare l’immagine o cercare una copertina dal web.</span>
                                    )}
                                </div>
                            </div>
                        )}
                        {imageUrl ? (
                            <img
                                src={imageUrl}
                                alt="Locandina evento"
                                className="event-image w-full h-auto object-cover"
                            />
                        ) : (
                            <div className={`event-image-placeholder w-full ${imageCropStatus === 'failed' ? 'h-24' : 'h-55'} flex items-center justify-center text-[#5f5b56]`}>Nessuna immagine</div>
                        )}
                        {imageCropStatus !== 'processing' && (imageUrl || eventData.originalImageUrl) && (
                            <button type="button" onClick={() => handleOpenCropper(imageUrl || eventData.originalImageUrl)} className="flex min-h-11 w-full items-center justify-center gap-2 border-t border-black/10 px-4 py-3 text-sm font-semibold text-[#8f3823]">
                                <Crop className="h-4 w-4" aria-hidden="true" />{imageUrl ? 'Ritaglia immagine' : 'Ritaglia originale'}
                            </button>
                        )}
                        {imageCropStatus !== 'processing' && !manualImageOverride && eventData.title?.trim() && (
                            <EventCoverPicker title={eventData.title} date={eventData.date || ''} location={eventData.location || ''}
                                onSelect={blob => {
                                    const previewUrl = URL.createObjectURL(blob);
                                    cropPreviewUrls.current.push(previewUrl);
                                    setManualImageOverride(true);
                                    setWebImageOverride(true);
                                    setImageUrl(previewUrl);
                                    currentImageUrl.current = previewUrl;
                                    onImageChange?.(previewUrl, originalCropSource.current);
                                }} />
                        )}
                        {isEditing && (
                            <div className="block p-4 border-t border-black/10 text-sm text-[#5f5b56]">
                                <label>
                                Cambia immagine
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="event-image-upload mt-2 text-sm w-full"
                                    onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const url = URL.createObjectURL(file);
                                            cropPreviewUrls.current.push(url);
                                            originalCropSource.current = url;
                                            draftImageSource.current = url;
                                            setManualImageOverride(true);
                                            setWebImageOverride(false);
                                            setImageUrl(url);
                                            currentImageUrl.current = url;
                                            onImageChange?.(url, url);
                                        }
                                    }}
                                />
                                </label>
                            </div>
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
                                <EventCategoryBadge category={eventData.category} className="event-category tracking-wider" />
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

                        {isEditing && onSave && (
                            <section className="space-y-3 border-t border-black/10 pt-5">
                                <label className="block text-sm font-semibold text-[#1d1d1b]">
                                    Istruzioni per l’intelligenza artificiale
                                    <textarea
                                        value={aiInstructions}
                                        onChange={(event) => setAiInstructions(event.target.value)}
                                        maxLength={MAX_AI_INSTRUCTIONS_LENGTH}
                                        rows={3}
                                        placeholder="Es. È una rassegna: separa le date e usa il nome dello spettacolo nel titolo."
                                        className={`${inputClass} mt-2 resize-y text-sm font-normal`}
                                    />
                                </label>
                                <p className="mb-0 text-right text-xs text-[#5f5b56]">{aiInstructions.length}/{MAX_AI_INSTRUCTIONS_LENGTH}</p>
                                <button
                                    type="button"
                                    onClick={handleReprocessWithAi}
                                    disabled={isReprocessing || !aiInstructions.trim()}
                                    className="inline-flex items-center gap-2 border border-[#1d1d1b] px-4 py-2 text-sm font-bold text-[#1d1d1b] transition-colors hover:bg-[#1d1d1b] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isReprocessing ? 'Rielaborazione…' : 'Rielabora con AI'}
                                </button>
                                {reprocessMessage && <p role="status" className="mb-0 text-sm text-green-800">{reprocessMessage}</p>}
                                {reprocessError && <p role="alert" className="mb-0 text-sm text-red-700">{reprocessError}</p>}
                            </section>
                        )}

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
                                disabled={isSaving || isReprocessing}
                                className="event-edit-save-button btn btn-outline disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isEditing ? 'Salva modifiche' : 'Modifica dettagli'}
                            </button>
                            {!isEditing && showPublishButton && (
                                <button
                                    type="button"
                                    onClick={handleAddEvent}
                                    disabled={isSaving || isReprocessing || !!duplicate}
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
            {cropSource && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="draft-cover-crop-title">
                    <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl space-y-4 overflow-y-auto bg-white p-4 sm:p-6">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 id="draft-cover-crop-title" className="mb-1 text-xl font-bold text-black">Ritaglia copertina</h2>
                            </div>
                            <button type="button" onClick={() => setCropSource(null)} className="px-3 py-2 text-sm font-semibold text-gray-700 underline">Chiudi</button>
                        </div>
                        <EventImageCropper
                            image={cropSource}
                            onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
                        />
                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => setCropSource(null)} className="px-4 py-2 border border-gray-300 text-sm font-semibold text-gray-700">Annulla</button>
                            <button type="button" onClick={handleApplyCrop} disabled={!croppedAreaPixels} className="px-4 py-2 bg-red-700 text-sm font-semibold text-white disabled:opacity-50">Applica ritaglio</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}