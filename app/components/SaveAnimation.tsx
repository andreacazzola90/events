'use client';

import { useEffect } from 'react';
import RocketLaunchAnimation from './RocketLaunchAnimation';

interface SaveAnimationProps {
    status: 'saving' | 'success' | 'hidden';
    onComplete?: () => void;
}

const SAVING_MESSAGES = [
    'Sto pubblicando l’evento; poi attenderò la conferma del salvataggio.',
    'Il salvataggio è ancora in corso; il decollo partirà solo dopo la conferma.',
];

export default function SaveAnimation({ status, onComplete }: SaveAnimationProps) {
    useEffect(() => {
        if (status !== 'success') return;
        const timer = window.setTimeout(() => onComplete?.(), 2000);
        return () => window.clearTimeout(timer);
    }, [status, onComplete]);

    if (status === 'hidden') return null;

    return (
        <RocketLaunchAnimation
            stage={status === 'saving' ? 'ignite' : 'launch'}
            messageSequence={status === 'saving' ? SAVING_MESSAGES : undefined}
            fullscreen
            loadingPhase="saving"
        />
    );
}
