'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ReactNode } from 'react';
import { usePageTransition } from '../lib/PageTransitionContext';

interface TransitionLinkProps {
    href: string;
    children: ReactNode;
    className?: string;
    onClick?: () => void;
    replace?: boolean;
}

export function TransitionLink({
    href,
    children,
    className = '',
    onClick,
    replace = false
}: TransitionLinkProps) {
    const router = useRouter();
    const { startTransition, endTransition } = usePageTransition();

    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();

        // Esegui callback personalizzato se presente
        if (onClick) {
            onClick();
        }

        // Avvia la transizione
        startTransition();

        // Simula il caricamento e naviga
        setTimeout(() => {
            if (replace) {
                router.replace(href);
            } else {
                router.push(href);
            }

            // Termina la transizione dopo la navigazione
            setTimeout(() => {
                endTransition();
            }, 200);
        }, 300); // Delay per permettere l'animazione di fade out
    };

    return (
        <Link
            href={href}
            className={className}
            onClick={handleClick}
        >
            {children}
        </Link>
    );
}