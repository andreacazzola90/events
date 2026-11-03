'use client';

import { Loader2 } from 'lucide-react';
import RocketLaunchAnimation from './RocketLaunchAnimation';

type LoadingPhase = 'generic' | 'scan-image' | 'scan-link' | 'shared-image' | 'saving' | 'received';

interface LoadingAnimationProps {
    message?: string;
    phase?: LoadingPhase;
}

const SCAN_PHASES: LoadingPhase[] = ['scan-image', 'scan-link', 'shared-image'];

export default function LoadingAnimation({ message = 'Elaborazione in corso', phase = 'generic' }: LoadingAnimationProps) {
    if (SCAN_PHASES.includes(phase)) {
        return <RocketLaunchAnimation stage="build" message={message} loadingPhase={phase} />;
    }
    return (
        <div className="request-status" role="status" aria-live="polite" data-loading-phase={phase}>
            <Loader2 className="request-status-icon" aria-hidden="true" />
            <p className="request-status-message">{message}</p>
        </div>
    );
}
