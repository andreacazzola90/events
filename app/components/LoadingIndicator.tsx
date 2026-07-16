'use client';

import { usePageTransition } from '../lib/PageTransitionContext';

export function LoadingIndicator() {
    const { isTransitioning, transitionProgress } = usePageTransition();

    if (!isTransitioning) return null;

    return (
        <div
            className="fixed top-0 left-0 right-0 z-[9999] h-[2px] bg-black/10"
            role="progressbar"
            aria-valuenow={Math.round(transitionProgress)}
            aria-valuemin={0}
            aria-valuemax={100}
        >
            <div
                className="h-full bg-black transition-all duration-200 ease-out"
                style={{ width: `${transitionProgress}%` }}
            />
        </div>
    );
}