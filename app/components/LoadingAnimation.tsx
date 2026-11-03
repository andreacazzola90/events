'use client';

import { Loader2 } from 'lucide-react';

type LoadingPhase = 'generic' | 'scan-image' | 'scan-link' | 'shared-image' | 'saving' | 'received';

interface LoadingAnimationProps {
    message?: string;
    phase?: LoadingPhase;
}

export default function LoadingAnimation({ message = 'Elaborazione in corso', phase = 'generic' }: LoadingAnimationProps) {
    return (
        <div className="request-status" role="status" aria-live="polite" data-loading-phase={phase}>
            <Loader2 className="request-status-icon" aria-hidden="true" />
            <p className="request-status-message">{message}</p>
        </div>
    );
}
