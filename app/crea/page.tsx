'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { ArrowLeft, CalendarDays, CheckCircle2, CircleAlert, Clock3, Loader2, MapPin, Send } from 'lucide-react';
import { trackEventCreate } from '../lib/gtm';
import { trackEvent } from '../lib/analytics';
import LoadingAnimation from '../components/LoadingAnimation';
import RocketLaunchAnimation from '../components/RocketLaunchAnimation';
import PageHeading from '../components/PageHeading';
import { useRouter } from 'next/navigation';
import ImageUploader from '../components/ImageUploader';
import { DuplicateMatch, EventData } from '../types/event';
import EventDisplay from '../components/EventDisplay';
import MultipleEventsEditor from '../components/MultipleEventsEditor';
import SharedImageHandler from '../components/SharedImageHandler';
import { toast } from 'react-toastify';
import { logClientError } from '../lib/error-tool';
import { appendPosterImage, composeDraftImageCrops, detectPosterSections, prepareDraftForPublication, type DraftImageCrop, type DraftImageCropBox, type DraftImageCropFailure, type DraftImageCropStatus, type DraftImageScan } from '../../lib/draft-image-crop';
import { getEventStartTime, sameEventStartTime } from '../../lib/event-display';
import { normalizeCategory, normalizePrice, toIsoDate } from '../../lib/event-utils';
import { parseEventDate } from '../../lib/calendar-ics';
import { AUTOPILOT_STOP_MESSAGES, AUTOPUBLISH_STORAGE_KEY, getAutopilotDecision } from '../../lib/event-autopilot';

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
        time = getEventStartTime(time) || '';
    }
    // Luogo
    if (location) {
        location = location.replace(/\s+/g, ' ').trim();
    }
    return { ...event, date, time, location };
}

type OptimisticEventStatus = 'ready' | 'pending' | 'created' | 'duplicate' | 'failed';
type OptimisticEvent = { event: EventData; status: OptimisticEventStatus };
type AutopilotState = { run: number; stage: 'position' | 'ignite' | 'launch' | 'stopped'; reason?: string };
type SaveOptions = { onConfirmed?: () => Promise<void> };

const OPTIMISTIC_STATUS_LABELS: Record<OptimisticEventStatus, string> = {
    ready: 'In preparazione al lancio',
    pending: 'Pubblicazione in corso',
    created: 'Evento creato',
    duplicate: 'Evento già presente',
    failed: 'Pubblicazione non riuscita',
};

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
    const [isPublishingAll, setIsPublishingAll] = useState(false);
    const publicationInFlight = useRef(false);
    const settledDrafts = useRef(new WeakSet<EventData>());
    const savedBatch = useRef({ count: 0, firstSlug: null as string | null });
    const linkRequest = useRef<AbortController | null>(null);
    const [duplicates, setDuplicates] = useState<(DuplicateMatch | null)[]>([]);
    const duplicateCheckId = useRef(0);
    const imageCropId = useRef(0);
    const pendingImageCrop = useRef<DraftImageCrop | undefined>(undefined);
    const [imageCropStatus, setImageCropStatus] = useState<DraftImageCropStatus>('idle');
    const [imageCropFailure, setImageCropFailure] = useState<DraftImageCropFailure | undefined>(undefined);
    const [posterSectionsPending, setPosterSectionsPending] = useState(false);
    const posterSectionUrls = useRef<string[]>([]);
    const manualCoverUrls = useRef(new Set<string>());
    const releaseManualCovers = () => {
        manualCoverUrls.current.forEach(url => URL.revokeObjectURL(url));
        manualCoverUrls.current.clear();
    };
    const releasePosterSections = () => {
        posterSectionUrls.current.forEach(url => URL.revokeObjectURL(url));
        posterSectionUrls.current = [];
        setPosterSectionsPending(false);
    };
    const imageProcessing = imageCropStatus === 'processing' || posterSectionsPending;
    const draftScanId = useRef(0);
    const [autoPublish, setAutoPublish] = useState(true);
    const autoPublishRef = useRef(true);
    const [autopilot, setAutopilot] = useState<AutopilotState | null>(null);
    const autopilotRun = useRef(0);
    const launchDone = useRef<(() => void) | null>(null);
    const [duplicatesChecked, setDuplicatesChecked] = useState(false);
    const [coverMissing, setCoverMissing] = useState(false);
    const [needsReview, setNeedsReview] = useState(false);
    const autopilotActive = !!autopilot && autopilot.stage !== 'stopped';
    const autopilotMessages = autopilot?.stage === 'position'
        ? imageCropStatus === 'processing'
            ? [
                'Sto aspettando che la copertina sia pronta; poi completerò i controlli prima del salvataggio.',
                'La preparazione della copertina è ancora in corso; l’evento non verrà salvato finché non termina.',
            ]
            : posterSectionsPending
                ? [
                    'Sto completando le sezioni della locandina; poi riprenderò i controlli per la pubblicazione.',
                    'Le sezioni della locandina sono ancora in elaborazione; il salvataggio aspetta il completamento.',
                ]
                : !duplicatesChecked
                    ? [
                        'Sto verificando se l’evento è già presente; poi controllerò gli altri requisiti di pubblicazione.',
                        'Il controllo dei duplicati è ancora in corso; il salvataggio aspetta il suo esito.',
                    ]
                    : [
                        'Sto aspettando che i controlli di copertina e duplicati siano pronti; poi deciderò se pubblicare.',
                        'La pubblicazione resta in attesa finché i controlli richiesti non hanno un esito.',
                    ]
        : autopilot?.stage === 'ignite'
            ? [
                'Sto pubblicando l’evento; il decollo partirà dopo la conferma.',
                'Attendo la conferma del salvataggio: solo allora inizierà la navigazione.',
            ]
            : undefined;

    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        try {
            if (window.localStorage.getItem(AUTOPUBLISH_STORAGE_KEY) === '0') {
                autoPublishRef.current = false;
                setAutoPublish(false);
            }
        } catch {
            // Storage can be blocked (private mode, sandboxed frames): keep the default.
        }
        return () => {
            mounted.current = false;
            autopilotRun.current++;
            launchDone.current?.();
        };
    }, []);

    const handleAutoPublishChange = (enabled: boolean) => {
        autoPublishRef.current = enabled;
        setAutoPublish(enabled);
        try {
            window.localStorage.setItem(AUTOPUBLISH_STORAGE_KEY, enabled ? '1' : '0');
        } catch {
            // The choice still applies to this visit.
        }
    };

    const cancelAutopilot = () => {
        autopilotRun.current++;
        setAutopilot(null);
    };

    const startAutopilot = (options: { eventCount: number; coverMissing: boolean; needsReview: boolean }) => {
        setCoverMissing(options.coverMissing);
        setNeedsReview(options.needsReview);
        if (!autoPublishRef.current || options.eventCount === 0) {
            cancelAutopilot();
            return;
        }
        setAutopilot({ run: ++autopilotRun.current, stage: 'position' });
    };

    const playLaunch = (run: number) => new Promise<void>(resolve => {
        if (autopilotRun.current !== run) {
            resolve();
            return;
        }
        let timer: number | undefined;
        const finish = () => {
            window.clearTimeout(timer);
            if (launchDone.current === finish) launchDone.current = null;
            resolve();
        };
        const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        // The liftoff lasts 0.9 s; the timer guarantees navigation even if animationend never fires.
        timer = window.setTimeout(finish, reducedMotion ? 0 : 1000);
        launchDone.current = finish;
        setAutopilot({ run, stage: 'launch' });
    });

    const beginDraftScan = (): DraftImageScan => {
        cancelAutopilot();
        linkRequest.current?.abort();
        setLoadingLink(false);
        const scanId = ++draftScanId.current;
        imageCropId.current++;
        pendingImageCrop.current?.cancel();
        pendingImageCrop.current = undefined;
        setImageCropStatus('idle');
        releasePosterSections();
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
        setDuplicatesChecked(false);
        try {
            const response = await fetch('/api/events/check-duplicates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    events: list.map(({ title, date, time, sourceUrl }) => ({ title, date, time, sourceUrl })),
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
        } finally {
            if (checkId === duplicateCheckId.current) setDuplicatesChecked(true);
        }
    };

    const resetEvents = () => {
        if (publicationInFlight.current) return;
        cancelAutopilot();
        linkRequest.current?.abort();
        setLoadingLink(false);
        settledDrafts.current = new WeakSet();
        savedBatch.current = { count: 0, firstSlug: null };
        draftScanId.current++;
        imageCropId.current++;
        pendingImageCrop.current?.cancel();
        pendingImageCrop.current = undefined;
        setImageCropStatus('idle');
        releasePosterSections();
        setEvents([]);
        releaseManualCovers();
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
        linkRequest.current?.abort();
        draftScanId.current++;
        imageCropId.current++;
        pendingImageCrop.current?.cancel();
        posterSectionUrls.current.forEach(url => URL.revokeObjectURL(url));
        manualCoverUrls.current.forEach(url => URL.revokeObjectURL(url));
    }, []);

    useEffect(() => {
        const retained = new Set(events.flatMap(event => [event.imageUrl, event.originalImageUrl, event.posterImageUrl]));
        manualCoverUrls.current.forEach(url => {
            if (!retained.has(url)) {
                URL.revokeObjectURL(url);
                manualCoverUrls.current.delete(url);
            }
        });
    }, [events]);

    useEffect(() => () => {
        if (originalImageUrl) URL.revokeObjectURL(originalImageUrl);
    }, [originalImageUrl]);

    const handleNewEvents = (newEventsOrSingle: EventData | EventData[], newImageUrl: string, debug?: any, crop?: DraftImageCrop) => {
        const cropId = ++imageCropId.current;
        if (pendingImageCrop.current !== crop) pendingImageCrop.current?.cancel();
        pendingImageCrop.current = crop;
        setImageCropStatus(crop && newImageUrl ? 'processing' : 'idle');
        setImageCropFailure(undefined);
        releasePosterSections();

        // Converti in array se è un singolo evento
        const newEvents = Array.isArray(newEventsOrSingle) ? newEventsOrSingle : [newEventsOrSingle];
        const sourceImageUrl = newEvents[0]?.originalImageUrl || (crop ? newImageUrl : undefined);
        setOriginalImageUrl(sourceImageUrl || null);

        // Normalizza e aggiungi imageUrl
        let eventsWithImage = newEvents.map(ev => normalizeEventFields({
            ...ev,
            imageUrl: crop ? newImageUrl : ev.imageUrl || newImageUrl,
            originalImageUrl: ev.originalImageUrl || sourceImageUrl,
        }));
        const eventIdentities = new Set<string>();
        eventsWithImage = eventsWithImage.filter(event => {
            const identity = [event.title, event.date, event.time, event.location]
                .map(value => value.trim().toLocaleLowerCase('it-IT'))
                .join('\u0000');
            if (eventIdentities.has(identity)) return false;
            eventIdentities.add(identity);
            return true;
        });

        console.log(`[handleNewEvents] Processati ${eventsWithImage.length} eventi`);
        settledDrafts.current = new WeakSet();
        savedBatch.current = { count: 0, firstSlug: null };
        setOptimisticEvents(null);
        setEvents(eventsWithImage);
        setImageUrl(newImageUrl);
        setProcessingSharedImage(false);
        setError(null);
        if (debug?.scanStatus === 'partial' && debug?.scanCounts) {
            const counts = debug.scanCounts;
            const unscanned = debug.unscannedPages ? ` ${debug.unscannedPages} pagine non lette.` : '';
            toast.info(`Scansione PDF parziale: ${counts.completed} candidati completati, ${counts.failed} non riusciti, ${counts.pending} in attesa.${unscanned}`, { autoClose: false });
        } else if (debug?.pdfTextSummarized) {
            toast.info('Il programma PDF è stato analizzato pagina per pagina. Controlla gli appuntamenti prima di salvare.');
        }
        checkDuplicates(eventsWithImage);
        startAutopilot({ eventCount: eventsWithImage.length, coverMissing: !newImageUrl, needsReview: !!debug?.pdfTextSummarized });
        const sectionDrafts = eventsWithImage;
        // A poster listing several events: each event gets its own section as cover, the full poster stays as extra image.
        const startPosterSections = (posterUrl: string, parentCrop?: DraftImageCropBox) => {
            if (sectionDrafts.length < 2 || !/^(blob:|data:image\/)/.test(posterUrl)) return;
            if (sourceImageUrl && sourceImageUrl !== posterUrl && !parentCrop) return;
            setPosterSectionsPending(true);
            void detectPosterSections(posterUrl, sectionDrafts).then(sections => {
                if (cropId !== imageCropId.current) {
                    sections.forEach(section => URL.revokeObjectURL(section.imageUrl));
                    return;
                }
                posterSectionUrls.current.push(...[...sections.values()].map(section => section.imageUrl));
                setEvents(current => current.length !== sectionDrafts.length ? current : current.map((event, index) => {
                    const section = sections.get(index);
                    return section && event.imageUrl === posterUrl ? {
                        ...event,
                        imageUrl: section.imageUrl,
                        originalImageCrop: parentCrop ? composeDraftImageCrops(parentCrop, section.crop) : section.crop,
                        posterImageUrl: posterUrl,
                    } : event;
                }));
                setPosterSectionsPending(false);
                if (sections.size) toast.info(`Copertina ritagliata per ${sections.size} eventi su ${sectionDrafts.length}; la locandina completa verrà salvata tra le immagini.`);
            }).catch(sectionError => {
                console.warn('[Crea] Poster sections failed:', sectionError);
                if (cropId === imageCropId.current) setPosterSectionsPending(false);
            });
        };
        if (crop && newImageUrl) {
            void crop.result.then(blob => {
                if (cropId !== imageCropId.current) return;
                const croppedUrl = blob ? URL.createObjectURL(blob) : undefined;
                setEvents(current => current.map(event => event.imageUrl === newImageUrl
                    ? { ...event, imageUrl: croppedUrl, originalImageUrl: event.originalImageUrl || newImageUrl, originalImageCrop: blob ? crop.box : undefined }
                    : event));
                setImageUrl(croppedUrl || null);
                pendingImageCrop.current = undefined;
                setImageCropStatus(blob ? 'completed' : 'failed');
                setImageCropFailure(blob ? undefined : crop.failureReason);
                if (croppedUrl && crop.box) startPosterSections(croppedUrl, crop.box);
            });
        } else {
            crop?.cancel();
            if (newImageUrl) startPosterSections(newImageUrl);
        }
    };


    const handleDraftImageChange = (index: number, image: string, original?: string, crop?: EventData['originalImageCrop']) => {
        if (image.startsWith('blob:')) manualCoverUrls.current.add(image);
        setEvents(current => current.map((event, eventIndex) => eventIndex === index
            ? {
                ...event,
                imageUrl: image,
                originalImageUrl: original || event.originalImageUrl,
                ...(crop ? { originalImageCrop: crop } : {}),
            }
            : event));
    };

    const handleSaveAll = async (eventsToSave: EventData[], allDrafts = events, options: SaveOptions = {}): Promise<'navigated' | 'partial' | void> => {
        if (publicationInFlight.current) return;
        // A manual publish supersedes a paused autopilot and its stale reason.
        if (!options.onConfirmed) cancelAutopilot();
        eventsToSave = eventsToSave.filter(draft => !settledDrafts.current.has(draft));
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
            const failures: Error[] = [];
            let nextIndex = 0;
            const normalized = eventsToSave.map(normalizeEventFields);
            const completions = eventsToSave.map(() => {
                let finish!: () => void;
                const promise = new Promise<void>(resolve => { finish = resolve; });
                return { promise, finish };
            });
            const publishDraft = async (draft: EventData, eventIndex: number) => {
                try {
                    const eventData = prepareDraftForPublication({
                        ...normalized[eventIndex],
                        category: normalizeCategory(draft.category),
                        price: normalizePrice(draft.price),
                    });
                    // Se c'è un'immagine blob, carica con FormData
                    if (eventData.imageUrl && eventData.imageUrl.startsWith('blob:')) {
                        const response = await fetch(eventData.imageUrl);
                        const blob = await response.blob();
                        const formData = new FormData();
                        formData.append('eventData', JSON.stringify(eventData));
                        formData.append('image', blob, `event-image.${blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'}`);
                        const originalSource = draft.originalImageUrl;
                        if (originalSource && /^(blob:|data:image\/)/.test(originalSource)) {
                            const originalBlob = await (await fetch(originalSource)).blob();
                            if (!originalBlob.type.startsWith('image/')) throw new Error('Immagine originale non valida.');
                            const originalExtension = originalBlob.type === 'image/png' ? 'png'
                                : originalBlob.type === 'image/webp' ? 'webp'
                                    : originalBlob.type === 'image/gif' ? 'gif' : 'jpg';
                            formData.append('originalImage', originalBlob, `original-event-image.${originalExtension}`);
                        }
                        await appendPosterImage(formData, draft.posterImageUrl, eventData.imageUrl);

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
                                    settledDrafts.current.add(draft);
                                    return;
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
                        settledDrafts.current.add(draft);
                        savedBatch.current.count += 1;
                        updateOptimisticStatus(eventIndex, 'created');
                        if (!savedBatch.current.firstSlug && savedEvent?.slug) {
                            savedBatch.current.firstSlug = savedEvent.slug;
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
                                    settledDrafts.current.add(draft);
                                    return;
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
                        settledDrafts.current.add(draft);
                        savedBatch.current.count += 1;
                        updateOptimisticStatus(eventIndex, 'created');
                        if (!savedBatch.current.firstSlug && savedEvent?.slug) {
                            savedBatch.current.firstSlug = savedEvent.slug;
                        }
                        trackEventCreate(savedEvent);
                        trackEvent('event_create', 'Events', eventData.title);
                    }
                } catch (error) {
                    updateOptimisticStatus(eventIndex, 'failed');
                    failures.push(error instanceof Error ? error : new Error('Errore durante la pubblicazione'));
                } finally {
                    completions[eventIndex].finish();
                }
            };
            const worker = async () => {
                while (nextIndex < eventsToSave.length) {
                    const eventIndex = nextIndex++;
                    const candidate = normalized[eventIndex];
                    for (let peerIndex = 0; peerIndex < eventIndex; peerIndex++) {
                        const peer = normalized[peerIndex];
                        if (toIsoDate(peer.date || '') === toIsoDate(candidate.date || '')
                            && (!getEventStartTime(peer.time) || !getEventStartTime(candidate.time)
                                || sameEventStartTime(peer.time, candidate.time))) {
                            await completions[peerIndex].promise;
                        }
                    }
                    await publishDraft(eventsToSave[eventIndex], eventIndex);
                }
            };
            await Promise.all([worker(), worker()]);
            const remaining = allDrafts.filter(draft => !settledDrafts.current.has(draft));
            if (failures.length) {
                setEvents(remaining);
                checkDuplicates(remaining);
                throw failures[0];
            }
            if (remaining.length) {
                setEvents(remaining);
                checkDuplicates(remaining);
                return 'partial';
            }
            const { count: successfulSaves, firstSlug: firstSavedSlug } = savedBatch.current;
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
            }
            await options.onConfirmed?.();
            // The user left /crea meanwhile: the event is saved, don't pull them back.
            if (!mounted.current) return 'navigated';

            // Reset state after successful save
            publicationInFlight.current = false;
            resetEvents();
            // Redirect to event detail when exactly one event was created
            if (successfulSaves === 1 && firstSavedSlug) {
                router.push(`/events/${firstSavedSlug}`);
            } else {
                router.push('/');
            }
            return 'navigated';
        } catch (error) {
            console.error('Error saving events:', error);
            setError(error instanceof Error ? error.message : 'Errore durante la pubblicazione degli eventi');
            throw error;
        } finally {
            publicationInFlight.current = false;
            setIsPublishingAll(false);
        }
    };

    const handlePublishDraft = async (index: number, updated: EventData) => {
        if (publicationInFlight.current) return;
        const next = events.map((draft, draftIndex) => draftIndex === index ? updated : draft);
        setEvents(next);
        await handleSaveAll([updated], next);
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

    const handleSaveAllRef = useRef(handleSaveAll);
    useEffect(() => {
        handleSaveAllRef.current = handleSaveAll;
    });

    useEffect(() => {
        if (autopilot?.stage !== 'position') return;
        const decision = getAutopilotDecision({
            // An unreadable date cannot be published safely, so treat it as missing.
            events: events.map(event => ({ title: event.title, date: event.date && parseEventDate(event.date) ? event.date : '' })),
            duplicates,
            duplicatesChecked,
            cropStatus: imageCropStatus,
            sectionsPending: posterSectionsPending,
            coverMissing,
            needsReview,
        });
        if (decision.action === 'wait') return;
        const { run } = autopilot;
        if (decision.action === 'stop') {
            setAutopilot({ run, stage: 'stopped', reason: AUTOPILOT_STOP_MESSAGES[decision.reason] });
            return;
        }
        setAutopilot({ run, stage: 'ignite' });
        void handleSaveAllRef.current(events, events, { onConfirmed: () => playLaunch(run) })
            .then(outcome => {
                if (autopilotRun.current === run && outcome !== 'navigated') {
                    setAutopilot({ run, stage: 'stopped', reason: 'Alcuni eventi richiedono la tua revisione.' });
                }
            })
            .catch(publishError => {
                if (autopilotRun.current !== run) return;
                const message = publishError instanceof Error ? publishError.message : 'Errore durante la pubblicazione degli eventi';
                setAutopilot({ run, stage: 'stopped', reason: message });
            });
    }, [autopilot, events, duplicates, duplicatesChecked, imageCropStatus, posterSectionsPending, coverMissing, needsReview]);

    const handleLinkSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loadingLink || publicationInFlight.current) return;
        if (!linkUrl.trim()) {
            const msg = 'Inserisci un link valido';
            setError(msg);
            toast.error(msg);
            return;
        }

        const scan = beginDraftScan();
        const controller = new AbortController();
        linkRequest.current = controller;
        const timeoutId = setTimeout(() => controller.abort(), 90000);
        setLoadingLink(true);
        setError(null);

        try {

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
            if (!scan.isCurrent()) return;

            if (data.events && data.events.length > 0) {
                if (!scan.isCurrent()) return;
                const isPdfResult = Boolean(data.previewImageDataUrl);
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
                    imageUrl: ev.imageUrl || (!isPdfResult ? pdfPreviewUrl || data.imageUrl || undefined : undefined),
                    sourceUrl: ev.sourceUrl || (isPdfResult ? linkUrl : ev.sourceUrl),
                }));
                setEvents(normalized);
                settledDrafts.current = new WeakSet();
                savedBatch.current = { count: 0, firstSlug: null };
                setOptimisticEvents(null);
                setImageUrl(pdfPreviewUrl || data.imageUrl || null);
                if (data.debug?.scanStatus === 'partial' && data.debug?.scanCounts) {
                    const counts = data.debug.scanCounts;
                    const unscanned = data.debug.unscannedPages ? ` ${data.debug.unscannedPages} pagine non lette.` : '';
                    toast.info(`Scansione PDF parziale: ${counts.completed} candidati completati, ${counts.failed} non riusciti, ${counts.pending} in attesa.${unscanned}`, { autoClose: false });
                } else if (data.debug?.pdfTextSummarized) {
                    toast.info('Il programma PDF è stato analizzato pagina per pagina. Controlla gli appuntamenti prima di salvare.');
                }
                setLinkUrl('');
                checkDuplicates(normalized);
                startAutopilot({ eventCount: normalized.length, coverMissing: false, needsReview: !!data.debug?.pdfTextSummarized });
            } else {
                const counts = data.debug?.scanCounts;
                const unscanned = data.debug?.unscannedPages ? ` ${data.debug.unscannedPages} pagine non lette.` : '';
                setError(counts
                    ? `Nessun candidato completato (${counts.failed || 0} non riusciti, ${counts.pending || 0} in attesa).${unscanned} Riprova con la fonte.`
                    : 'Nessun evento trovato dal link');
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
            clearTimeout(timeoutId);
            if (linkRequest.current === controller) linkRequest.current = null;
            if (scan.isCurrent()) setLoadingLink(false);
        }
    };

    const optimisticCards: OptimisticEvent[] | null = optimisticEvents
        ?? (autopilotActive ? events.map(event => ({ event, status: 'ready' as const })) : null);

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
                <section className="editorial-container create-page-intro">
                    <div className="animate-fadeInUp">
                        <PageHeading
                            className="max-w-4xl"
                            kicker="EventScanner / Nuovo evento"
                            title={autopilotActive ? (
                                <>Il tuo evento sta <span className="text-[#d65a38]">decollando</span></>
                            ) : events.length > 0 ? (
                                <>Rivedi i dettagli <span className="text-[#d65a38]">{events.length > 1 ? 'degli eventi' : 'dell’evento'}</span></>
                            ) : (
                                <>Crea un nuovo <span className="text-[#d65a38]">evento</span></>
                            )}
                            description={
                                autopilotActive
                                    ? 'Lo pubblichiamo appena è pronto: potrai modificarlo subito dopo.'
                                    : events.length > 0
                                    ? 'Controlla le informazioni estratte e completa i dettagli prima di pubblicare.'
                                    : 'Carica la locandina o inserisci un link: estrarremo automaticamente le informazioni principali.'
                            }
                        />
                    </div>
                </section>

                <div className="editorial-container">
                    <div className="create-content-stack space-y-8">
                        {/* Creation Methods - Only show if no events extracted */}
                        {events.length === 0 && (
                            <label className="create-autopublish-toggle flex cursor-pointer items-start gap-3 text-sm text-[var(--foreground)]">
                                <input
                                    type="checkbox"
                                    data-testid="autopublish-toggle"
                                    checked={autoPublish}
                                    onChange={event => handleAutoPublishChange(event.target.checked)}
                                    className="mt-0.5 h-5 w-5 shrink-0 accent-[#d65a38]"
                                />
                                <span>
                                    <span className="block font-bold">Pubblica automaticamente</span>
                                    <span className="block text-[var(--foreground-muted)]">Pubblichiamo appena la scansione è pronta; ci fermiamo solo se serve il tuo controllo. Disattiva per rivedere sempre i dettagli.</span>
                                </span>
                            </label>
                        )}
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
                                            <LoadingAnimation message="Scansione pagina web in corso" phase="scan-link" />
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
                                                    aria-busy={loadingLink}
                                                    className="btn btn-primary w-full !bg-[#b9432b] !border-[#b9432b] text-white disabled:opacity-50"
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
                            <div role="alert" className="border border-[#d65a38]/40 bg-[#fff7f4] p-6 animate-fadeInUp">
                                <div className="flex items-start gap-4">
                                    <span className="text-[#b84b2d] text-3xl shrink-0">⚠️</span>
                                    <div className="flex-1">
                                        <h3 className="text-[#8f3823] font-semibold text-lg mb-2">Si è verificato un errore</h3>
                                        <p className="text-[#5f5b56] leading-relaxed mb-0">{error}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {autopilot && autopilotActive && (
                            <section className="surface-panel create-autopilot-panel p-6 md:p-8 animate-fadeInUp" data-testid="autopilot-panel" aria-label="Pubblicazione automatica">
                                <RocketLaunchAnimation stage={autopilot.stage} messageSequence={autopilotMessages} onLaunchEnd={() => launchDone.current?.()} />
                                {autopilot.stage === 'position' && (
                                    <div className="mt-4 flex justify-center">
                                        <button
                                            type="button"
                                            data-testid="autopilot-review"
                                            onClick={() => setAutopilot({ run: autopilot.run, stage: 'stopped', reason: AUTOPILOT_STOP_MESSAGES['user-stopped'] })}
                                            className="inline-flex min-h-11 items-center justify-center border border-[var(--line)] px-4 py-2 text-sm font-bold text-[var(--foreground)] transition-colors hover:border-[#d65a38]"
                                        >
                                            Rivedi prima di pubblicare
                                        </button>
                                    </div>
                                )}
                            </section>
                        )}

                        {autopilot?.stage === 'stopped' && events.length > 0 && (
                            <div className="surface-panel p-4" data-testid="autopilot-stopped">
                                <RocketLaunchAnimation compact stage="stopped" message={`Lancio in pausa: ${autopilot.reason ?? ''}`} />
                            </div>
                        )}

                        {optimisticCards && (
                            <section aria-label="Eventi in pubblicazione" className="mb-6 space-y-3" aria-live="polite">
                                {optimisticCards.map(({ event, status }, index) => (
                                    <article
                                        key={`${event.title}-${event.date}-${index}`}
                                        data-optimistic-status={status}
                                        className="flex gap-4 rounded-md border border-[#d65a38]/30 bg-white p-4 shadow-sm"
                                    >
                                        {event.imageUrl && (
                                            <img src={event.imageUrl} alt="" className="h-24 w-20 shrink-0 object-cover" />
                                        )}
                                        <div className="min-w-0 flex-1">
                                        <div className={`flex items-center gap-2 text-sm font-semibold ${status === 'created' ? 'text-green-700' : 'text-[#8f3823]'}`}>
                                            {status === 'created'
                                                ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                                                : status === 'duplicate' || status === 'failed'
                                                    ? <CircleAlert className="h-4 w-4" aria-hidden="true" />
                                                    : autopilotActive
                                                        ? <Clock3 className="h-4 w-4" aria-hidden="true" />
                                                        : <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                                                    <span>{OPTIMISTIC_STATUS_LABELS[status]}</span>
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
                                        </div>
                                    </article>
                                ))}
                            </section>
                        )}

                        {events.length > 0 && !autopilotActive && (
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
                        <fieldset disabled={isPublishingAll} hidden={autopilotActive} className="min-w-0">
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
                                onSaveAll={async drafts => { await handleSaveAll(drafts); }}
                                onPublish={handlePublishDraft}
                                onCancel={resetEvents}
                            />
                        ) : events.length === 1 ? (
                            <EventDisplay
                                eventData={events[0]}
                                imageProcessing={imageProcessing}
                                imageCropStatus={imageCropStatus}
                                imageCropFailure={imageCropFailure}
                                onImageChange={(image, original, crop) => handleDraftImageChange(0, image, original, crop)}
                                duplicate={duplicates[0]}
                                showPublishButton={false}
                                onPublish={updated => handlePublishDraft(0, updated)}
                                onSave={(updated) => {
                                    setEvents([updated]);
                                    checkDuplicates([updated]);
                                }}
                            />
                        ) : null}
                        </fieldset>
                    </div>
                </div>
            </main>
        </>
    );
}
