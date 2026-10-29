'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { ArrowLeft, CalendarDays, CheckCircle2, CircleAlert, Clock3, Loader2, MapPin, Send } from 'lucide-react';
import { trackEventCreate } from '../lib/gtm';
import { trackEvent } from '../lib/analytics';
import LoadingAnimation from '../components/LoadingAnimation';
import { useRouter } from 'next/navigation';
import ImageUploader from '../components/ImageUploader';
import { DuplicateMatch, EventData } from '../types/event';
import EventDisplay from '../components/EventDisplay';
import MultipleEventsEditor from '../components/MultipleEventsEditor';
import SharedImageHandler from '../components/SharedImageHandler';
import { toast } from 'react-toastify';
import { logClientError } from '../lib/error-tool';
import { prepareDraftForPublication, type DraftImageCrop, type DraftImageCropFailure, type DraftImageCropStatus, type DraftImageScan } from '../../lib/draft-image-crop';

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

type OptimisticEventStatus = 'pending' | 'created' | 'duplicate';
type OptimisticEvent = { event: EventData; status: OptimisticEventStatus };

export default function CreaEvento() {
    const router = useRouter();
    const [events, setEvents] = useState<EventData[]>([]);
    const [optimisticEvents, setOptimisticEvents] = useState<OptimisticEvent[] | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [processingSharedImage, setProcessingSharedImage] = useState(false);
    const [linkUrl, setLinkUrl] = useState('');
    const [loadingLink, setLoadingLink] = useState(false);
    const [linkReceived, setLinkReceived] = useState(false);
    const [isPublishingAll, setIsPublishingAll] = useState(false);
    const publicationInFlight = useRef(false);
    const [duplicates, setDuplicates] = useState<(DuplicateMatch | null)[]>([]);
    const duplicateCheckId = useRef(0);
    const imageCropId = useRef(0);
    const pendingImageCrop = useRef<DraftImageCrop | undefined>(undefined);
    const [imageCropStatus, setImageCropStatus] = useState<DraftImageCropStatus>('idle');
    const [imageCropFailure, setImageCropFailure] = useState<DraftImageCropFailure | undefined>(undefined);
    const imageProcessing = imageCropStatus === 'processing';
    const draftScanId = useRef(0);

    const beginDraftScan = (): DraftImageScan => {
        const scanId = ++draftScanId.current;
        imageCropId.current++;
        pendingImageCrop.current?.cancel();
        pendingImageCrop.current = undefined;
        setImageCropStatus('idle');
        return {
            isCurrent: () => draftScanId.current === scanId,
            registerCrop: crop => {
                if (draftScanId.current !== scanId) crop.cancel();
                else pendingImageCrop.current = crop;
            },
        };
    };

    const checkDuplicates = async (list: EventData[]) => {
        const checkId = ++duplicateCheckId.current;
        setDuplicates([]);
        try {
            const response = await fetch('/api/events/check-duplicates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    events: list.map(({ title, date, sourceUrl }) => ({ title, date, sourceUrl })),
                }),
            });
            if (!response.ok || checkId !== duplicateCheckId.current) return;
            const data = await response.json();
            const found: (DuplicateMatch | null)[] = Array.isArray(data.duplicates) ? data.duplicates : [];
            setDuplicates(found);
            const count = found.filter(Boolean).length;
            if (count > 0) {
                toast.warning(count === 1 && list.length === 1
                    ? 'Questo evento esiste già nel calendario.'
                    : `${count} eventi su ${list.length} esistono già nel calendario.`);
            }
        } catch (err) {
            // The server still blocks duplicates on save, so a failed pre-check is not fatal.
            console.warn('[Crea] Duplicate check failed:', err);
        }
    };

    const resetEvents = () => {
        draftScanId.current++;
        imageCropId.current++;
        pendingImageCrop.current?.cancel();
        pendingImageCrop.current = undefined;
        setImageCropStatus('idle');
        setEvents([]);
        setOptimisticEvents(null);
        setImageUrl(null);
        setOriginalImageUrl(null);
        setDuplicates([]);
        setError(null);
    };

    useEffect(() => {
        return () => {
            // Cleanup any object URLs when component unmounts
            if (imageUrl && imageUrl !== originalImageUrl) {
                URL.revokeObjectURL(imageUrl);
            }
        };
    }, [imageUrl, originalImageUrl]);

    useEffect(() => () => {
        draftScanId.current++;
        imageCropId.current++;
        pendingImageCrop.current?.cancel();
    }, []);

    useEffect(() => () => {
        if (originalImageUrl) URL.revokeObjectURL(originalImageUrl);
    }, [originalImageUrl]);

    const handleNewEvents = (newEventsOrSingle: EventData | EventData[], newImageUrl: string, debug?: any, crop?: DraftImageCrop) => {
        const cropId = ++imageCropId.current;
        if (pendingImageCrop.current !== crop) pendingImageCrop.current?.cancel();
        pendingImageCrop.current = crop;
        setImageCropStatus(crop && newImageUrl ? 'processing' : 'idle');
        setImageCropFailure(undefined);

        // Converti in array se è un singolo evento
        const newEvents = Array.isArray(newEventsOrSingle) ? newEventsOrSingle : [newEventsOrSingle];
        setOriginalImageUrl(newImageUrl || null);

        // Normalizza e aggiungi imageUrl
        let eventsWithImage = newEvents.map(ev => normalizeEventFields({
            ...ev,
            imageUrl: crop ? newImageUrl : ev.imageUrl || newImageUrl,
            originalImageUrl: newImageUrl || undefined,
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
        setProcessingSharedImage(false);
        setError(null);
        if (debug?.pdfTextSummarized) {
            toast.info('Il programma PDF è stato riassunto pagina per pagina. Controlla tutti gli appuntamenti estratti prima di salvare.');
        }
        checkDuplicates(eventsWithImage);
        if (crop && newImageUrl) {
            void crop.result.then(blob => {
                if (cropId !== imageCropId.current) return;
                const croppedUrl = blob ? URL.createObjectURL(blob) : undefined;
                setEvents(current => current.map(event => event.imageUrl === newImageUrl
                    ? { ...event, imageUrl: croppedUrl, originalImageUrl: newImageUrl }
                    : event));
                setImageUrl(croppedUrl || null);
                pendingImageCrop.current = undefined;
                setImageCropStatus(blob ? 'completed' : 'failed');
                setImageCropFailure(blob ? undefined : crop.failureReason);
            });
        } else {
            crop?.cancel();
        }
    };


    const handleDraftImageChange = (index: number, image: string, original?: string) => {
        setEvents(current => current.map((event, eventIndex) => eventIndex === index
            ? { ...event, imageUrl: image, originalImageUrl: original || event.originalImageUrl }
            : event));
    };

    const handleSaveAll = async (eventsToSave: EventData[]) => {
        if (publicationInFlight.current) return;
        if (imageProcessing) throw new Error('Attendi il controllo della copertina.');
        if (eventsToSave.length === 0) throw new Error('Nessun nuovo evento da pubblicare: gli eventi risultano già presenti.');

        publicationInFlight.current = true;
        setIsPublishingAll(true);
        setError(null);
        setOptimisticEvents(eventsToSave.map(event => ({ event: { ...event }, status: 'pending' })));
        const updateOptimisticStatus = (eventIndex: number, status: OptimisticEventStatus) => {
            setOptimisticEvents(current => current?.map((item, index) =>
                index === eventIndex ? { ...item, status } : item
            ) ?? null);
        };
        try {
            let successfulSaves = 0;
            let firstSavedSlug: string | null = null;

            for (const [eventIndex, draft] of eventsToSave.entries()) {
                const eventData = prepareDraftForPublication(draft);
                // Se c'è un'immagine blob, carica con FormData
                if (eventData.imageUrl && eventData.imageUrl.startsWith('blob:')) {
                    const response = await fetch(eventData.imageUrl);
                    const blob = await response.blob();
                    const formData = new FormData();
                    formData.append('eventData', JSON.stringify(eventData));
                    formData.append('image', blob, `event-image.${blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'}`);

                    const saveResponse = await fetch('/api/events', {
                        method: 'POST',
                        body: formData,
                    });
                    if (!saveResponse.ok) {
                        let message = `Failed to save event: ${eventData.title}`;
                        try {
                            const body = await saveResponse.json();
                            if (saveResponse.status === 409 && (body?.error === 'EVENT_DUPLICATE')) {
                                message = body?.message || 'Questo evento è già stato creato.';
                                toast.info(message);
                                updateOptimisticStatus(eventIndex, 'duplicate');
                                console.warn('[Crea] Duplicate event skipped in batch save:', message);
                                continue;
                            }
                            if (body?.message || body?.details || body?.error) {
                                message = body.message || body.details || body.error;
                            }
                        } catch {
                            // ignore JSON parse errors, use default message
                        }
                        throw new Error(message);
                    }

                    // Track event creation
                    const savedEvent = await saveResponse.json();
                    successfulSaves += 1;
                    updateOptimisticStatus(eventIndex, 'created');
                    if (!firstSavedSlug && savedEvent?.slug) {
                        firstSavedSlug = savedEvent.slug;
                    }
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
                        let message = `Failed to save event: ${eventData.title}`;
                        try {
                            const body = await response.json();
                            if (response.status === 409 && (body?.error === 'EVENT_DUPLICATE')) {
                                message = body?.message || 'Questo evento è già stato creato.';
                                toast.info(message);
                                updateOptimisticStatus(eventIndex, 'duplicate');
                                console.warn('[Crea] Duplicate event skipped in batch save (JSON):', message);
                                continue;
                            }
                            if (body?.message || body?.details || body?.error) {
                                message = body.message || body.details || body.error;
                            }
                        } catch {
                            // ignore JSON parse errors, use default message
                        }
                        throw new Error(message);
                    }

                    // Track event creation
                    const savedEvent = await response.json();
                    successfulSaves += 1;
                    updateOptimisticStatus(eventIndex, 'created');
                    if (!firstSavedSlug && savedEvent?.slug) {
                        firstSavedSlug = savedEvent.slug;
                    }
                    trackEventCreate(savedEvent);
                    trackEvent('event_create', 'Events', eventData.title);
                }
            }
            if (successfulSaves === 0) {
                throw new Error('Nessun nuovo evento è stato creato: gli eventi risultano già presenti.');
            }
            console.log(`Successfully saved ${successfulSaves} events`);
            if (successfulSaves > 0) {
                toast.success(successfulSaves === 1 ? 'Evento creato' : `${successfulSaves} eventi creati`);
            }

            // Clear service worker cache
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                console.log('[Crea] Sending CLEAR_CACHE message to service worker');
                navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            // Reset state after successful save
            resetEvents();
            // Redirect to event detail when exactly one event was created
            if (successfulSaves === 1 && firstSavedSlug) {
                router.push(`/events/${firstSavedSlug}`);
            } else {
                router.push('/');
            }
        } catch (error) {
            console.error('Error saving events:', error);
            setOptimisticEvents(null);
            throw error; // Re-throw to let the MultipleEventsEditor handle it
        } finally {
            publicationInFlight.current = false;
            setIsPublishingAll(false);
        }
    };

    const handlePublishAllEvents = async () => {
        const eventsToSave = events.filter((_, index) => !duplicates[index]);
        if (publicationInFlight.current) return;

        setError(null);
        try {
            await handleSaveAll(eventsToSave);
        } catch (publishError) {
            const message = publishError instanceof Error ? publishError.message : 'Errore durante la pubblicazione degli eventi';
            setError(message);
            toast.error(message);
        }
    };

    const handleLinkSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!linkUrl.trim()) {
            const msg = 'Inserisci un link valido';
            setError(msg);
            toast.error(msg);
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

        const scan = beginDraftScan();
        setLoadingLink(true);
        setLinkReceived(true);
        setError(null);
        // Mostra l'animazione di ricezione per 1.8s, poi passa allo stato di elaborazione
        setTimeout(() => setLinkReceived(false), 1800);

        try {
            // Create a fetch request with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 secondi - ottimizzato

            const isPdfLink = (() => {
                try {
                    return new URL(linkUrl).pathname.toLowerCase().endsWith('.pdf');
                } catch {
                    return false;
                }
            })();
            const response = await fetch(isPdfLink ? '/api/process-pdf' : '/api/process-link', {
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
                if (!scan.isCurrent()) return;
                const pdfPreviewUrl = data.previewImageDataUrl
                    ? URL.createObjectURL(await (await fetch(data.previewImageDataUrl)).blob())
                    : null;
                if (!scan.isCurrent()) {
                    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
                    return;
                }
                // Normalizza i campi estratti
                const normalized = data.events.map((ev: EventData) => normalizeEventFields({
                    ...ev,
                    imageUrl: ev.imageUrl || pdfPreviewUrl || undefined,
                    sourceUrl: ev.sourceUrl || (isPdfLink ? linkUrl : ev.sourceUrl),
                }));
                setEvents(normalized);
                setImageUrl(pdfPreviewUrl || data.imageUrl || null);
                if (data.debug?.pdfTextSummarized) {
                    toast.info('Il programma PDF è stato riassunto pagina per pagina. Controlla tutti gli appuntamenti estratti prima di salvare.');
                }
                setLinkUrl('');
                checkDuplicates(normalized);
            } else {
                setError('Nessun evento trovato dal link');
            }
        } catch (error) {
            if (!scan.isCurrent()) return;
            console.error('Error processing link:', error);

            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    const msg = 'La richiesta ha impiegato troppo tempo. Il server potrebbe essere occupato, riprova tra qualche minuto.';
                    setError(msg);
                    toast.error(msg);
                    logClientError({
                        message: msg,
                        source: 'CreaEvento.handleLinkSubmit',
                        severity: 'warning',
                    });
                } else if (error.message.includes('Failed to fetch') || error.message.includes('ERR_NETWORK_CHANGED')) {
                    const msg = 'Problema di connessione di rete. Controlla la connessione internet e riprova.';
                    setError(msg);
                    toast.error(msg);
                    logClientError({
                        message: msg,
                        source: 'CreaEvento.handleLinkSubmit',
                        severity: 'warning',
                    });
                } else {
                    const msg = error.message || 'Errore durante l\'elaborazione del link. Riprova.';
                    setError(msg);
                    toast.error(msg);
                    logClientError({
                        message: msg,
                        source: 'CreaEvento.handleLinkSubmit',
                        severity: 'error',
                        details: { rawMessage: error.message },
                    });
                }
            } else {
                const msg = 'Errore durante l\'elaborazione del link. Riprova.';
                setError(msg);
                toast.error(msg);
                logClientError({
                    message: msg,
                    source: 'CreaEvento.handleLinkSubmit',
                    severity: 'error',
                });
            }
        } finally {
            setLoadingLink(false);
        }
    };

    return (
        <>
            {/* Shared Image Handler with Suspense */}
            <Suspense fallback={null}>
                <SharedImageHandler
                    onProcessed={handleNewEvents}
                    onStart={() => {
                        setError(null);
                        setProcessingSharedImage(true);
                        return beginDraftScan();
                    }}
                    onError={(message) => {
                        setProcessingSharedImage(false);
                        setError(message);
                        toast.error(message);
                    }}
                />
            </Suspense>

            <main className="min-h-screen page-shell create-event-page">
                <section className="editorial-container create-page-intro mb-10 md:mb-14">
                    <div className="animate-fadeInUp flex flex-col items-start gap-5">
                        <div>
                            <p className="section-kicker mb-4">EventScanner / Nuovo evento</p>
                            <h1 className="section-title max-w-4xl">
                                {events.length > 0 ? (
                                    <>Rivedi i dettagli <span className="text-[#d65a38]">{events.length > 1 ? 'degli eventi' : 'dell’evento'}</span></>
                                ) : (
                                    <>Crea un nuovo <span className="text-[#d65a38]">evento</span></>
                                )}
                            </h1>
                        </div>
                        <p className="section-lead max-w-2xl mb-0">
                                {events.length > 0
                                    ? 'Controlla le informazioni estratte e completa i dettagli prima di pubblicare.'
                                    : 'Carica la locandina o inserisci un link: estrarremo automaticamente le informazioni principali.'
                                }
                        </p>

                    </div>
                </section>

                <div className="editorial-container">
                    <div className="create-content-stack space-y-8">
                        {/* Creation Methods - Only show if no events extracted */}
                        {events.length === 0 && (
                            <div className="create-methods-grid grid md:grid-cols-2 gap-8">
                                {processingSharedImage && (
                                    <div className="md:col-span-2 surface-panel p-6 md:p-8 animate-fadeInUp">
                                        <LoadingAnimation message="Scansione immagine condivisa in corso" phase="shared-image" />
                                    </div>
                                )}

                                {/* Image Upload Method - First on Mobile */}
                                <div className="surface-panel create-method-card p-6 md:p-8 order-1 md:order-2">
                                    <div className="create-method-intro mb-6 border-b border-black/10 pb-5">
                                        <p className="section-kicker mb-2">Metodo 01</p>
                                        <h2 className="text-2xl font-black text-[#1d1d1b] mb-2">Carica una locandina</h2>
                                        <p className="text-sm text-[#5f5b56] mb-0">L’analisi dell’immagine compilerà i dettagli dell’evento.</p>
                                    </div>

                                    <ImageUploader
                                        onStart={beginDraftScan}
                                        onProcessed={handleNewEvents}
                                        onError={(message: string) => {
                                            setError(message);
                                            resetEvents();
                                        }}
                                    />
                                </div>

                                {/* Link Input Method - Second on Mobile */}
                                <div className="surface-panel create-method-card p-6 md:p-8 order-2 md:order-1">
                                    <div className="create-method-intro mb-6 border-b border-black/10 pb-5">
                                        <p className="section-kicker mb-2">Metodo 02</p>
                                        <h2 className="text-2xl font-black text-[#1d1d1b] mb-2">Importa da un link</h2>
                                        <p className="text-sm text-[#5f5b56] mb-0">Inserisci la pagina dell’evento per estrarne le informazioni.</p>
                                    </div>

                                    <form onSubmit={handleLinkSubmit} className="space-y-4">
                                        {loadingLink ? (
                                            linkReceived
                                                ? <LoadingAnimation message="Link ricevuto!" phase="received" />
                                                : <LoadingAnimation message="Scansione pagina web in corso" phase="scan-link" />
                                        ) : (
                                            <>
                                                <input
                                                    type="url"
                                                    placeholder="https://esempio.it/evento"
                                                    value={linkUrl}
                                                    onChange={(e) => setLinkUrl(e.target.value)}
                                                    className="w-full bg-white border border-black/20 px-4 py-3 text-black placeholder-black/40 focus:outline-none focus:border-black transition-colors"
                                                    disabled={loadingLink}
                                                />
                                                <button
                                                    type="submit"
                                                    disabled={loadingLink}
                                                    className="btn btn-primary w-full disabled:opacity-50"
                                                >
                                                    ✨ Estrai evento
                                                </button>
                                            </>
                                        )}
                                    </form>
                                </div>
                            </div>
                        )}

                        {/* Error Display */}
                        {error && (
                            <div className="border border-[#d65a38]/40 bg-[#fff7f4] p-6 animate-fadeInUp">
                                <div className="flex items-start gap-4">
                                    <span className="text-[#b84b2d] text-3xl shrink-0">⚠️</span>
                                    <div className="flex-1">
                                        <h3 className="text-[#8f3823] font-semibold text-lg mb-2">Si è verificato un errore</h3>
                                        <p className="text-[#5f5b56] leading-relaxed mb-0">{error}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {optimisticEvents && (
                            <section aria-label="Eventi in pubblicazione" className="mb-6 space-y-3" aria-live="polite">
                                {optimisticEvents.map(({ event, status }, index) => (
                                    <article
                                        key={`${event.title}-${event.date}-${index}`}
                                        className="rounded-md border border-[#d65a38]/30 bg-white p-4 shadow-sm"
                                    >
                                        <div className={`flex items-center gap-2 text-sm font-semibold ${status === 'created' ? 'text-green-700' : 'text-[#8f3823]'}`}>
                                            {status === 'created'
                                                ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                                                : status === 'duplicate'
                                                    ? <CircleAlert className="h-4 w-4" aria-hidden="true" />
                                                    : <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                                            <span>{status === 'created' ? 'Evento creato' : status === 'duplicate' ? 'Evento già presente' : 'Pubblicazione in corso'}</span>
                                        </div>
                                        <h2 className="mt-2 text-lg font-bold text-[#1d1d1b]">{event.title}</h2>
                                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-[#5f5b56]">
                                            {event.date && event.date !== 'non trovato' && (
                                                <span className="inline-flex items-center gap-1.5">
                                                    <CalendarDays className="h-4 w-4" aria-hidden="true" />
                                                    {event.date}
                                                </span>
                                            )}
                                            {event.time && event.time !== 'non trovato' && (
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Clock3 className="h-4 w-4" aria-hidden="true" />
                                                    {event.time}
                                                </span>
                                            )}
                                            {event.location && event.location !== 'non trovato' && (
                                                <span className="inline-flex items-center gap-1.5">
                                                    <MapPin className="h-4 w-4" aria-hidden="true" />
                                                    {event.location}
                                                </span>
                                            )}
                                        </div>
                                    </article>
                                ))}
                            </section>
                        )}

                        {events.length > 0 && (
                            <div className="sticky top-16 z-30 flex items-center justify-between gap-2 border-b border-black/10 bg-[var(--background)] py-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        resetEvents();
                                        setError(null);
                                    }}
                                    disabled={isPublishingAll}
                                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 border border-[#1d1d1b] px-3 py-2 text-xs font-bold text-[#1d1d1b] transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                                >
                                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                                    Crea un altro evento
                                </button>
                                <button
                                    type="button"
                                    data-testid="publish-all-events-top"
                                    onClick={handlePublishAllEvents}
                                    disabled={isPublishingAll}
                                    aria-busy={isPublishingAll}
                                    className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 bg-[#1d1d1b] px-2 py-3 text-xs font-bold text-white transition-colors hover:bg-[#d65a38] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none sm:px-5 sm:text-sm"
                                >
                                    <Send className="h-4 w-4" aria-hidden="true" />
                                    {isPublishingAll ? 'Pubblicazione…' : events.length === 1 ? 'Pubblica' : 'Pubblica tutti gli eventi'}
                                </button>
                            </div>
                        )}

                        {/* Event Editing Interface */}
                        {events.length > 1 ? (
                            <MultipleEventsEditor
                                events={events}
                                publishing={isPublishingAll}
                                imageProcessing={imageProcessing}
                                imageCropStatus={imageCropStatus}
                                imageCropFailure={imageCropFailure}
                                onImageChange={handleDraftImageChange}
                                duplicates={duplicates}
                                onEventsChange={updated => {
                                    setEvents(updated);
                                    checkDuplicates(updated);
                                }}
                                onSaveAll={handleSaveAll}
                                onCancel={resetEvents}
                            />
                        ) : events.length === 1 ? (
                            <EventDisplay
                                eventData={events[0]}
                                imageProcessing={imageProcessing}
                                imageCropStatus={imageCropStatus}
                                imageCropFailure={imageCropFailure}
                                onImageChange={(image, original) => handleDraftImageChange(0, image, original)}
                                duplicate={duplicates[0]}
                                showPublishButton={false}
                                onSave={(updated) => {
                                    setEvents([updated]);
                                    checkDuplicates([updated]);
                                }}
                            />
                        ) : null}
                    </div>
                </div>
            </main>
        </>
    );
}
