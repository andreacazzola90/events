'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { EventData, ProcessImageResponse } from '../types/event';
import { analyzeImageLocally } from '../lib/clientVision';

interface ImageUploaderProps {
    onProcessed: (events: EventData[], imageUrl: string) => void;
    onError: (error: string) => void;
}

export default function ImageUploader({ onProcessed, onError }: ImageUploaderProps) {
    const [isProcessing, setIsProcessing] = useState(false);

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;
        const file = acceptedFiles[0];
        if (file.size > 10 * 1024 * 1024) {
            onError('File size must be less than 10MB');
            return;
        }
        setIsProcessing(true);
        try {
            // Solo server (Groq)
            const response = await fetch('/api/process-image', {
                method: 'POST',
                body: (() => { const fd = new FormData(); fd.append('image', file); return fd; })(),
            });
            if (!response.ok) throw new Error('Failed to process image');
            const data: ProcessImageResponse & { engine?: string } = await response.json();
            const events = data.events;
            const imageUrl = URL.createObjectURL(file);
            onProcessed(events, imageUrl);
        } catch (e) {
            onError(e instanceof Error ? e.message : 'Failed to process image');
        } finally {
            setIsProcessing(false);
        }
    }, [onProcessed, onError]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp'] },
        maxFiles: 1
    });

    return (
        <div className="space-y-4">

            <div
                {...getRootProps()}
                className={`p-10 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'} ${isProcessing ? 'pointer-events-none opacity-50' : ''}`}
            >
                <input {...getInputProps()} />
                <div className="space-y-4">
                    {isProcessing ? (
                        <div className="flex flex-col items-center space-y-2">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                            <p className="font-medium">🤖 Analisi AI in corso...</p>
                            <p className="text-sm text-gray-500">Vision model sta leggendo l'immagine</p>
                        </div>
                    ) : (
                        <>
                            <div className="text-4xl">📸</div>
                            <p className="text-lg font-medium">
                                {isDragActive ? "Rilascia l'immagine qui..." : "Trascina un'immagine di evento, o clicca per selezionare"}
                            </p>
                            <p className="text-sm text-gray-500">Supporta JPG, PNG, GIF, WebP (max 10MB)</p>
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
                                <p className="text-sm text-blue-800 font-medium">🧠 Powered by Vision AI (Groq)</p>
                                <p className="text-xs text-blue-600 mt-1">Estrazione semantica avanzata multi-evento</p>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}