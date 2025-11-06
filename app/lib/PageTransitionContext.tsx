'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

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

    const startTransition = () => {
        setIsTransitioning(true);
        setTransitionProgress(0);

        // Simula progress incrementale
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 30 + 10; // Incrementi casuali tra 10-40%
            if (progress >= 90) {
                progress = 90; // Ferma al 90% fino al completamento reale
                clearInterval(interval);
            }
            setTransitionProgress(progress);
        }, 100);
    };

    const endTransition = () => {
        setTransitionProgress(100);
        setTimeout(() => {
            setIsTransitioning(false);
            setTransitionProgress(0);
        }, 300); // Piccolo delay per completare l'animazione
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