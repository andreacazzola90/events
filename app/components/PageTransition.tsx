'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { usePageTransition } from '../lib/PageTransitionContext';

interface PageTransitionProps {
    children: ReactNode;
    className?: string;
}

export function PageTransition({ children, className = '' }: PageTransitionProps) {
    const { isTransitioning } = usePageTransition();
    const pathname = usePathname();
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

    // Scrolla in cima ad ogni cambio route
    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        }
    }, [pathname]);

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