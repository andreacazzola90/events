'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

interface PageTransitionProps {
    children: ReactNode;
    className?: string;
}

export function PageTransition({ children, className = '' }: PageTransitionProps) {
    const pathname = usePathname();
    const [visible, setVisible] = useState(false);

    // Fade in on mount and on pathname change
    useEffect(() => {
        setVisible(false);
        const t = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(t);
    }, [pathname]);

    // Scroll to top on route change
    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }, [pathname]);

    return (
        <div
            className={`transition-opacity duration-300 ease-in-out ${visible ? 'opacity-100' : 'opacity-0'} ${className}`}
            style={{ willChange: 'opacity' }}
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