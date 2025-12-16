'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { EventData } from '../types/event';

interface SharedImageHandlerProps {
    onProcessed: (data: EventData | EventData[], imageUrl: string) => void;
}

/**
 * Handles shared images from Web Share Target API
 * Wrapped in Suspense boundary in parent
 */
export default function SharedImageHandler({ onProcessed }: SharedImageHandlerProps) {
    const searchParams = useSearchParams();

    useEffect(() => {
        const isShared = searchParams?.get('shared');

        if (isShared === 'true') {
            console.log('[PWA] Handling shared content...');

            const handleSharedData = async () => {
                try {
                    // Check if there's a shared file in the cache
                    const cache = await caches.open('shared-images');
                    const cachedResponse = await cache.match('/shared-image');

                    if (cachedResponse) {
                        const blob = await cachedResponse.blob();
                        const file = new File([blob], 'shared-image.jpg', { type: blob.type });

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

                        if (response.ok) {
                            const data = await response.json();
                            onProcessed(data.events || data, imageUrl);
                        }

                        // Clean up cache
                        await cache.delete('/shared-image');
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
