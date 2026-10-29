'use client';

import Link from 'next/link';
import { ReactNode, type AriaAttributes } from 'react';

interface TransitionLinkProps extends AriaAttributes {
    href: string;
    children: ReactNode;
    className?: string;
    onClick?: () => void;
    replace?: boolean;
    style?: React.CSSProperties;
    title?: string;
}

export function TransitionLink({
    href,
    children,
    className = '',
    onClick,
    replace = false,
    style,
    title,
    ...ariaAttributes
}: TransitionLinkProps) {
    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        // Esegui callback personalizzato se presente
        if (onClick) {
            onClick();
        }
    };

    return (
        <Link
            {...ariaAttributes}
            href={href}
            className={className}
            onClick={handleClick}
            replace={replace}
            style={style}
            title={title}
        >
            {children}
        </Link>
    );
}