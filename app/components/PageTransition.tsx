'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname } from 'next/navigation';

interface PageTransitionProps {
    children: ReactNode;
    className?: string;
}

export function PageTransition({ children, className = '' }: PageTransitionProps) {
    const pathname = usePathname();

    // Scroll to top on route change
    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }, [pathname]);
    return (
        <div
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