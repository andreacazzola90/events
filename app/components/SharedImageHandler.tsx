'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { EventData } from '../types/event';

interface SharedImageHandlerProps {
    onProcessed: (data: EventData | EventData[], imageUrl: string, debugInfo?: any) => void;
}

/**
 * Handles shared images from Web Share Target API
 * Wrapped in Suspense boundary in parent
 */
export default function SharedImageHandler({ onProcessed }: SharedImageHandlerProps) {
    const searchParams = useSearchParams();

    useEffect(() => {
        const isShared = searchParams?.get('shared');
        const shareId = searchParams?.get('shareId');

        if (isShared === 'true' && shareId) {
            console.log('[PWA] Handling shared content...');

            const handleSharedData = async () => {
                try {
                    const sharedResponse = await fetch(`/api/share-target?shareId=${encodeURIComponent(shareId)}`);
                    if (!sharedResponse.ok) {
                        throw new Error('Impossibile recuperare immagine condivisa.');
                    }

                    const blob = await sharedResponse.blob();
                    const file = new File([blob], 'shared-image.jpg', { type: blob.type || 'image/jpeg' });

                    console.log('[PWA] Processing shared image:', file.name);

                    // Process the shared image
                    const imageUrl = URL.createObjectURL(file);

                    // Trigger image processing
                    const formData = new FormData();
                    formData.append('image', file);

                    const response = await fetch('/api/process-image', {
                        method: 'POST',
                        body: formData,
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(errorData?.error || 'Errore durante la scansione dell\'immagine condivisa.');
                    }

                    const data = await response.json();
                    if (data.events && Array.isArray(data.events)) {
                        onProcessed(data.events, imageUrl, data.debug);
                    } else {
                        onProcessed(data, imageUrl, data.debug);
                    }
                } catch (err) {
                    console.error('[PWA] Error handling shared data:', err);
                }
            };

            handleSharedData();
        }
    }, [searchParams, onProcessed]);

    return null; // This component doesn't render anything
}
