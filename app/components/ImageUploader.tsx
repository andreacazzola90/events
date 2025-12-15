'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { EventData } from '@/types/event';
import LoadingAnimation from './LoadingAnimation';

interface ImageUploaderProps {
    onProcessed: (data: EventData | EventData[], imageUrl: string) => void;
    onError: (error: string) => void;
}

export default function ImageUploader({ onProcessed, onError }: ImageUploaderProps) {
    const [isProcessing, setIsProcessing] = useState(false);

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;

        const file = acceptedFiles[0];
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
            onError('File size must be less than 10MB');
            return;
        }

        setIsProcessing(true);
        try {
            const response = await fetch('/api/process-image', {
                method: 'POST',
                body: (() => {
                    const formData = new FormData();
                    formData.append('image', file);
                    return formData;
                })(),
            });

            if (!response.ok) {
                // Estrai il messaggio di errore dal response body
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error || 'Impossibile elaborare l\'immagine';
                throw new Error(errorMessage);
            }

            const data = await response.json();
            console.log('[ImageUploader] 📦 Received data:', data);

            // Verifica se c'è un errore nel body anche con status 200
            if (data.error) {
                console.error('[ImageUploader] ❌ Error in response body:', data.error);
                throw new Error(data.error);
            }

            // Create a temporary URL for the image
            const imageUrl = URL.createObjectURL(file);

            // Gestisci sia evento singolo che eventi multipli
            if (data.events && Array.isArray(data.events)) {
                // Risposta con array di eventi
                console.log(`[ImageUploader] ✅ Ricevuti ${data.events.length} eventi multipli`);
                console.log('[ImageUploader] Eventi:', data.events.map((e: EventData) => e.title));
                onProcessed(data.events, imageUrl);
            } else {
                // Evento singolo (retrocompatibilità)
                console.log('[ImageUploader] ✅ Ricevuto 1 evento singolo');
                console.log('[ImageUploader] Evento:', data.title);
                onProcessed(data, imageUrl);
            }
        } catch (error) {
            const errorMessage = error instanceof Error
                ? error.message
                : 'Impossibile elaborare l\'immagine';
            console.error('[ImageUploader] ❌ Error:', errorMessage);
            if (error instanceof Error && error.stack) {
                console.error('[ImageUploader] Stack:', error.stack);
            }
            onError(errorMessage);
        } finally {
            setIsProcessing(false);
        }
    }, [onProcessed, onError]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp']
        },
        maxFiles: 1
    });

    return (
        <div
            {...getRootProps()}
            className={`p-10 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors
        ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
        ${isProcessing ? 'pointer-events-none' : ''}`}
        >
            <input {...getInputProps()} />
            <div className="space-y-4">
                {isProcessing ? (
                    <LoadingAnimation message="Processing your image" />
                ) : (
                    <>
                        <div className="text-4xl">📸</div>
                        <p className="text-lg font-medium">
                            {isDragActive
                                ? "Drop the image here..."
                                : "Drag and drop an event image, or click to select"}
                        </p>
                        <p className="text-sm text-gray-500">
                            Supports JPG, PNG, GIF, WebP (max 10MB)
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}