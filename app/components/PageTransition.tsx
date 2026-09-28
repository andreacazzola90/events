'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { gsap } from 'gsap';

interface PageTransitionProps {
    children: ReactNode;
    className?: string;
}

export function PageTransition({ children, className = '' }: PageTransitionProps) {
    const pathname = usePathname();
    const container = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const element = container.current;
        if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const context = gsap.context(() => {
            gsap.fromTo(element,
                { y: 12 },
                { y: 0, duration: 0.45, ease: 'power2.out', clearProps: 'all' }
            );
        }, element);
        return () => context.revert();
    }, [pathname]);

    // Scroll to top on route change
    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }, [pathname]);

    return (
        <div
            ref={container}
            className={className}
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