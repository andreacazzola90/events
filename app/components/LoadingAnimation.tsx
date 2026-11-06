'use client';

import { Loader2 } from 'lucide-react';
import RocketLaunchAnimation from './RocketLaunchAnimation';

type LoadingPhase = 'generic' | 'scan-image' | 'scan-pdf' | 'scan-link' | 'shared-image' | 'saving' | 'received';

const SCAN_MESSAGES: Record<Exclude<LoadingPhase, 'generic' | 'saving' | 'received'>, (message: string) => string[]> = {
    'scan-image': message => [
        message,
        'Sto estraendo testo e dettagli dall’immagine; poi controllerò i dati dell’evento.',
        'L’analisi dell’immagine è ancora in corso; al termine controllerò i dati estratti.',
    ],
    'scan-pdf': message => [
        message,
        'Sto leggendo il testo del PDF; poi controllerò i dati degli eventi.',
        'La lettura del PDF è ancora in corso; al termine controllerò i dati estratti.',
    ],
    'scan-link': message => [
        message,
        'Sto leggendo la pagina per individuare gli eventi; poi controllerò i dati trovati.',
        'La lettura della pagina è ancora in corso; al termine controllerò i dati estratti.',
    ],
    'shared-image': message => [
        message,
        'Sto analizzando l’immagine condivisa; poi controllerò i dati dell’evento.',
        'L’analisi dell’immagine condivisa è ancora in corso; al termine controllerò i dati estratti.',
    ],
};

interface LoadingAnimationProps {
    message?: string;
    phase?: LoadingPhase;
}

export default function LoadingAnimation({ message = 'Elaborazione in corso', phase = 'generic' }: LoadingAnimationProps) {
    if (phase in SCAN_MESSAGES) {
        const scanPhase = phase as keyof typeof SCAN_MESSAGES;
        return (
            <RocketLaunchAnimation
                stage="build"
                message={message}
                messageSequence={SCAN_MESSAGES[scanPhase](message)}
                fullscreen
                loadingPhase={phase}
            />
        );
    }
    return (
        <div className="request-status" role="status" aria-live="polite" data-loading-phase={phase}>
            <Loader2 className="request-status-icon" aria-hidden="true" />
            <p className="request-status-message">{message}</p>
        </div>
    );
}
