'use client';

import { useEffect, useMemo, useState } from 'react';

type LoadingPhase = 'generic' | 'scan-image' | 'scan-link' | 'shared-image' | 'saving' | 'received';

interface LoadingAnimationProps {
    message?: string;
    phase?: LoadingPhase;
}

function getPhaseSteps(phase: LoadingPhase): string[] {
    switch (phase) {
        case 'scan-image':
            return [
                'Preparazione immagine',
                'OCR in corso',
                'Analisi AI del contenuto',
                'Composizione evento',
            ];
        case 'scan-link':
            return [
                'Apertura pagina web',
                'Estrazione testo e metadati',
                'Analisi AI della pagina',
                'Composizione evento',
            ];
        case 'shared-image':
            return [
                'Rilevata immagine condivisa',
                'OCR in corso',
                'Analisi AI',
                'Preparazione risultato',
            ];
        case 'saving':
            return [
                'Validazione dati',
                'Upload immagine',
                'Salvataggio evento',
                'Aggiornamento cache',
            ];
        case 'generic':
        default:
            return ['Elaborazione richiesta', 'Analisi dati', 'Finalizzazione'];
    }
}

export default function LoadingAnimation({ message = 'Elaborazione in corso', phase = 'generic' }: LoadingAnimationProps) {
    const [seconds, setSeconds] = useState(0);
    const [stepIndex, setStepIndex] = useState(0);
    const steps = useMemo(() => getPhaseSteps(phase), [phase]);

    useEffect(() => {
        const timer = setInterval(() => setSeconds((prev) => prev + 1), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const stepTimer = setInterval(() => {
            setStepIndex((prev) => (prev + 1) % steps.length);
        }, 2400);
        return () => clearInterval(stepTimer);
    }, [steps.length]);

    if (phase === 'received') {
        return (
            <div className="flex flex-col items-center justify-center space-y-4 py-10 animate-fadeInUp">
                <div className="relative w-24 h-24">
                    {/* Outer pulse ring */}
                    <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
                    {/* Inner circle */}
                    <div className="absolute inset-0 rounded-full bg-green-500/30 flex items-center justify-center">
                        <svg
                            className="w-12 h-12 text-green-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                                className="animate-[dash_0.6s_ease-in-out_forwards]"
                            />
                        </svg>
                    </div>
                </div>
                <div className="text-center space-y-1">
                    <p className="text-lg font-semibold text-green-300">{message}</p>
                    <p className="text-sm text-gray-400">Elaborazione in background...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center space-y-5 py-10">
            <div className="relative w-24 h-24">
                <div className="absolute inset-0 rounded-full border-4 border-white/20" />
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-pink-400 border-r-purple-400 animate-spin" />
                <div className="absolute inset-3 rounded-full bg-white/10 flex items-center justify-center text-2xl">
                    ⏳
                </div>
            </div>

            <div className="w-full max-w-md">
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-linear-to-r from-pink-500 via-purple-500 to-blue-500 animate-loading-bar" />
                </div>
            </div>

            <div className="text-center space-y-1">
                <p className="text-lg font-semibold text-white">{message}</p>
                <p className="text-sm text-gray-300">
                    Step: <span className="text-pink-300 font-medium">{steps[stepIndex]}</span>
                </p>
                <p className="text-xs text-gray-400">Tempo trascorso: {seconds}s</p>
            </div>
        </div>
    );
}
