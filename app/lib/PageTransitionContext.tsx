'use client';

import { createContext, useContext, useState, useRef, ReactNode } from 'react';

interface PageTransitionContextType {
    isTransitioning: boolean;
    startTransition: () => void;
    endTransition: () => void;
    transitionProgress: number;
    setTransitionProgress: (progress: number) => void;
}

const PageTransitionContext = createContext<PageTransitionContextType | undefined>(undefined);

export function PageTransitionProvider({ children }: { children: ReactNode }) {
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [transitionProgress, setTransitionProgress] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const startTransition = () => {
        // Cancella eventuale intervallo in corso prima di crearne uno nuovo
        if (intervalRef.current !== null) {
            clearInterval(intervalRef.current);
        }

        setIsTransitioning(true);
        setTransitionProgress(0);

        let progress = 0;
        intervalRef.current = setInterval(() => {
            progress += Math.random() * 30 + 10;
            if (progress >= 90) {
                progress = 90;
                clearInterval(intervalRef.current!);
                intervalRef.current = null;
            }
            setTransitionProgress(progress);
        }, 100);
    };

    const endTransition = () => {
        if (intervalRef.current !== null) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setTransitionProgress(100);
        setTimeout(() => {
            setIsTransitioning(false);
            setTransitionProgress(0);
        }, 300);
    };

    return (
        <PageTransitionContext.Provider
            value={{
                isTransitioning,
                startTransition,
                endTransition,
                transitionProgress,
                setTransitionProgress
            }}
        >
            {children}
        </PageTransitionContext.Provider>
    );
}

export function usePageTransition() {
    const context = useContext(PageTransitionContext);
    if (context === undefined) {
        throw new Error('usePageTransition must be used within a PageTransitionProvider');
    }
    return context;
}