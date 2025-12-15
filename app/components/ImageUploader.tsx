'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { EventData } from '@/types/event';

interface ImageUploaderProps {
    onProcessed: (data: EventData) => void;
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

            // Verifica se c'è un errore nel body anche con status 200
            if (data.error) {
                throw new Error(data.error);
            }

            // Create a temporary URL for the image
            const imageUrl = URL.createObjectURL(file);
            onProcessed({ ...data, imageUrl });
        } catch (error) {
            const errorMessage = error instanceof Error
                ? error.message
                : 'Impossibile elaborare l\'immagine';
            console.error('[ImageUploader] Error:', errorMessage);
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
        ${isProcessing ? 'pointer-events-none opacity-50' : ''}`}
        >
            <input {...getInputProps()} />
            <div className="space-y-4">
                {isProcessing ? (
                    <div className="flex flex-col items-center space-y-2">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                        <p>Processing image...</p>
                    </div>
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