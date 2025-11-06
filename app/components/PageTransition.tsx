'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePageTransition } from '../lib/PageTransitionContext';

interface PageTransitionProps {
    children: ReactNode;
    className?: string;
}

export function PageTransition({ children, className = '' }: PageTransitionProps) {
    const { isTransitioning } = usePageTransition();
    const [isVisible, setIsVisible] = useState(true);
    const [shouldRender, setShouldRender] = useState(true);

    useEffect(() => {
        if (isTransitioning) {
            // Fade out quando inizia la transizione
            setIsVisible(false);
            setTimeout(() => {
                setShouldRender(false);
            }, 300); // Durata fade out
        } else {
            // Fade in quando finisce la transizione
            setShouldRender(true);
            setTimeout(() => {
                setIsVisible(true);
            }, 50); // Piccolo delay per assicurare il rendering
        }
    }, [isTransitioning]);

    return (
        <div
            className={`
        transition-all duration-300 ease-in-out
        ${isVisible ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-4'}
        ${className}
      `}
            style={{
                display: shouldRender ? 'block' : 'none'
            }}
        >
            {children}
        </div>
    );
}

export function PageTransitionWrapper({ children }: { children: ReactNode }) {
    return (
        <PageTransition className="min-h-screen">
            {children}
        </PageTransition>
    );
}