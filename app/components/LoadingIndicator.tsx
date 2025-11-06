'use client';

import { usePageTransition } from '../lib/PageTransitionContext';

export function LoadingIndicator() {
    const { isTransitioning, transitionProgress } = usePageTransition();

    if (!isTransitioning) return null;

    return (
        <>
            {/* Progress Bar Top */}
            <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-gray-900/20">
                <div
                    className="h-full bg-linear-to-r from-primary via-accent to-secondary transition-all duration-300 ease-out"
                    style={{ width: `${transitionProgress}%` }}
                />
            </div>

            {/* Overlay con spinner centrale */}
            <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                <div className="glass-effect rounded-3xl p-8 flex flex-col items-center space-y-4">
                    {/* Spinner dice.fm style */}
                    <div className="relative w-16 h-16">
                        <div className="absolute inset-0 rounded-full border-4 border-white/20"></div>
                        <div
                            className="absolute inset-0 rounded-full border-4 border-t-primary border-r-accent border-b-secondary border-l-transparent animate-spin"
                        ></div>
                        <div className="absolute inset-2 rounded-full bg-linear-to-br from-primary/20 to-accent/20 animate-pulse"></div>
                    </div>

                    {/* Loading text */}
                    <div className="text-center">
                        <p className="text-white font-medium text-lg">Caricamento...</p>
                        <p className="text-gray-400 text-sm mt-1">{Math.round(transitionProgress)}%</p>
                    </div>

                    {/* Progress dots */}
                    <div className="flex space-x-2">
                        {[0, 1, 2].map((i) => (
                            <div
                                key={i}
                                className={`w-2 h-2 rounded-full transition-all duration-300 ${transitionProgress > i * 33
                                        ? 'bg-primary scale-110'
                                        : 'bg-white/30 scale-100'
                                    }`}
                                style={{
                                    animationDelay: `${i * 0.2}s`,
                                    animation: transitionProgress > i * 33 ? 'pulse 1s infinite' : 'none'
                                }}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}