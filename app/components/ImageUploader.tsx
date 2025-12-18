'use client';

import { useCallback, useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { EventData } from '@/types/event';
import LoadingAnimation from './LoadingAnimation';

interface ImageUploaderProps {
    onProcessed: (data: EventData | EventData[], imageUrl: string, debugInfo?: any) => void;
    onError: (error: string) => void;
}

export default function ImageUploader({ onProcessed, onError }: ImageUploaderProps) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [showSourcePicker, setShowSourcePicker] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    const processFile = async (file: File) => {
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
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error || 'Impossibile elaborare l\'immagine';
                throw new Error(errorMessage);
            }

            const data = await response.json();
            console.log('[ImageUploader] 📦 Received data:', data);

            if (data.error) {
                console.error('[ImageUploader] ❌ Error in response body:', data.error);
                throw new Error(data.error);
            }

            const imageUrl = URL.createObjectURL(file);

            // Handle new response structure { events: [], debug: {} }
            if (data.events && Array.isArray(data.events)) {
                console.log(`[ImageUploader] ✅ Ricevuti ${data.events.length} eventi`);
                onProcessed(data.events, imageUrl, data.debug);
            } else {
                // Fallback for old structure or single event
                console.log('[ImageUploader] ✅ Ricevuto evento singolo/vecchio formato');
                onProcessed(data, imageUrl, data.debug);
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
            setShowSourcePicker(false);
        }
    };

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;
        const file = acceptedFiles[0];
        await processFile(file);
    }, [onProcessed, onError]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp']
        },
        maxFiles: 1,
        noClick: true, // Disable click to show custom picker
        noKeyboard: true
    });

    const handleAreaClick = () => {
        // Check if we're on mobile
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

        if (isMobile) {
            setShowSourcePicker(true);
        } else {
            // Desktop: open file picker directly
            fileInputRef.current?.click();
        }
    };

    const handleCameraClick = () => {
        cameraInputRef.current?.click();
    };

    const handleGalleryClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            await processFile(file);
        }
        // Reset input
        event.target.value = '';
    };

    return (
        <>
            <div
                {...getRootProps()}
                onClick={handleAreaClick}
                className={`p-10 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors
            ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
            ${isProcessing ? 'pointer-events-none' : ''}`}
            >
                <input {...getInputProps()} />

                {/* Hidden file inputs */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                />
                <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileChange}
                    className="hidden"
                />

                <div className="space-y-4">
                    {isProcessing ? (
                        <LoadingAnimation message="Processing your image" />
                    ) : (
                        <>
                            <div className="text-4xl">📸</div>
                            <p className="text-lg font-medium">
                                {isDragActive
                                    ? "Drop the image here..."
                                    : "Tap to add image or drag and drop"}
                            </p>
                            <p className="text-sm text-gray-500">
                                Supports JPG, PNG, GIF, WebP (max 10MB)
                            </p>
                        </>
                    )}
                </div>
            </div>

            {/* Mobile Source Picker Modal */}
            {showSourcePicker && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-50 animate-fade-in">
                    <div className="bg-white w-full rounded-t-3xl p-6 animate-slide-up">
                        <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-6"></div>

                        <h3 className="text-xl font-semibold mb-4 text-center">Scegli sorgente</h3>

                        <div className="space-y-3">
                            <button
                                onClick={handleCameraClick}
                                className="w-full flex items-center gap-4 p-4 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
                            >
                                <div className="text-3xl">📷</div>
                                <div className="text-left flex-1">
                                    <div className="font-semibold text-gray-900">Fotocamera</div>
                                    <div className="text-sm text-gray-600">Scatta una foto</div>
                                </div>
                            </button>

                            <button
                                onClick={handleGalleryClick}
                                className="w-full flex items-center gap-4 p-4 bg-green-50 hover:bg-green-100 rounded-xl transition-colors"
                            >
                                <div className="text-3xl">🖼️</div>
                                <div className="text-left flex-1">
                                    <div className="font-semibold text-gray-900">Galleria</div>
                                    <div className="text-sm text-gray-600">Scegli dalla galleria</div>
                                </div>
                            </button>

                            <button
                                onClick={() => setShowSourcePicker(false)}
                                className="w-full p-4 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors font-medium text-gray-700"
                            >
                                Annulla
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}