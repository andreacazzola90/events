'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { EventData } from '../types/event';
import { toast } from 'react-toastify';
import { startDraftImageCrop, type DraftImageCrop, type DraftImageScan } from '../../lib/draft-image-crop';

interface SharedImageHandlerProps {
    onProcessed: (data: EventData | EventData[], imageUrl: string, debugInfo?: any, crop?: DraftImageCrop) => void;
    onStart?: () => DraftImageScan;
    onError?: (message: string) => void;
}

/**
 * Handles shared images from Web Share Target API
 * Wrapped in Suspense boundary in parent
 */
export default function SharedImageHandler({ onProcessed, onStart, onError }: SharedImageHandlerProps) {
    const searchParams = useSearchParams();
    const processedShareIdRef = useRef<string | null>(null);
    const cancelRequest = useRef<(() => void) | undefined>(undefined);
    const sharedFileRequest = useRef<{ id: string; result: Promise<Blob> } | undefined>(undefined);

    useEffect(() => {
        const isShared = searchParams?.get('shared');
        const shareId = searchParams?.get('shareId');

        if (isShared !== 'true') {
            return;
        }

        if (!shareId) {
            onError?.('Nessuna immagine condivisa trovata. Riprova dalla schermata Condividi.');
            return;
        }

        // Evita doppia esecuzione in Strict Mode/dev o re-render ripetuti
        if (processedShareIdRef.current === shareId) {
            return;
        }
        cancelRequest.current?.();
        processedShareIdRef.current = shareId;

        if (isShared === 'true' && shareId) {
            console.log('[PWA] Handling shared content...');
            const scan = onStart?.();
            let crop: DraftImageCrop | undefined;
            let handedOff = false;
            let cancelled = false;
            cancelRequest.current = () => {
                cancelled = true;
                if (!handedOff) crop?.cancel();
            };
            const isCurrent = () => !cancelled && (!scan || scan.isCurrent());

            const handleSharedData = async () => {
                try {
                    if (sharedFileRequest.current?.id !== shareId) {
                        sharedFileRequest.current = {
                            id: shareId,
                            result: fetch(`/api/share-target?shareId=${encodeURIComponent(shareId)}`).then(async response => {
                                if (!response.ok) throw new Error('Impossibile recuperare immagine condivisa.');
                                return response.blob();
                            }),
                        };
                    }

                    const blob = await sharedFileRequest.current.result;
                    if (!isCurrent()) return;
                    const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
                    const file = new File([blob], `shared-image.${extension}`, { type: blob.type || 'image/jpeg' });
                    crop = startDraftImageCrop(file);
                    scan?.registerCrop(crop);

                    console.log('[PWA] Processing shared image:', file.name);

                    // Trigger image processing
                    const formData = new FormData();
                    formData.append('image', file);

                    const response = await fetch('/api/process-image', {
                        method: 'POST',
                        body: formData,
                    });

                    if (!isCurrent()) return;
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        if (!isCurrent()) return;
                        if ((response.status === 422 && errorData.code === 'POSTER_PRIVACY_REVIEW_REQUIRED') ||
                            (response.status === 503 && errorData.code === 'VISION_SERVICE_UNAVAILABLE')) {
                            onError?.(errorData.error || 'Ritaglia solo la locandina e riprova.');
                            return;
                        }
                        throw new Error(errorData?.error || 'Errore durante la scansione dell\'immagine condivisa.');
                    }

                    const data = await response.json();
                    if (!isCurrent()) return;
                    if (!data.previewImageDataUrl) {
                        toast.warn(data.imageWarning?.message || 'Evento generato senza copertina: immagine non disponibile. Puoi aggiungerla manualmente.', { autoClose: false });
                    }
                    const imageUrl = data.previewImageDataUrl
                        ? URL.createObjectURL(await (await fetch(data.previewImageDataUrl)).blob())
                        : '';
                    if (!isCurrent()) {
                        if (imageUrl) URL.revokeObjectURL(imageUrl);
                        return;
                    }
                    if (data.events && Array.isArray(data.events)) {
                        onProcessed(data.events.map((event: EventData) => ({ ...event, imageUrl: undefined, originalImageUrl: undefined })), imageUrl, data.debug, crop);
                    } else {
                        onProcessed({ ...data, imageUrl: undefined, originalImageUrl: undefined }, imageUrl, data.debug, crop);
                    }
                    handedOff = true;
                } catch (err) {
                    if (!isCurrent()) return;
                    console.error('[PWA] Error handling shared data:', err);
                    const message = err instanceof Error
                        ? err.message
                        : 'Errore durante la scansione dell\'immagine condivisa.';
                    onError?.(message);
                } finally {
                    if (!handedOff) crop?.cancel();
                }
            };

            handleSharedData();
        }
    }, [searchParams, onProcessed, onStart, onError]);

    useEffect(() => () => {
        cancelRequest.current?.();
        processedShareIdRef.current = null;
    }, []);

    return null; // This component doesn't render anything
}
