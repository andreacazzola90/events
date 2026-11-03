'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Pencil } from 'lucide-react';
import { TransitionLink } from '../../components/TransitionLink';

export default function NewEventBanner({ editHref }: { editHref: string }) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const isNew = searchParams?.get('nuovo') === '1';
    const [visible] = useState(isNew);

    useEffect(() => {
        if (!isNew || !pathname) return;
        // Drop the flag so reloads, shares and bookmarks don't show the banner again.
        router.replace(pathname, { scroll: false });
    }, [isNew, pathname, router]);

    if (!visible) return null;

    return (
        <div
            role="status"
            data-testid="new-event-banner"
            className="flex flex-col gap-3 border border-[#d65a38]/40 bg-[var(--accent-soft)] p-4 sm:flex-row sm:items-center sm:justify-between"
        >
            <p className="m-0 flex items-start gap-2 text-sm font-semibold text-[var(--foreground)]">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#d65a38]" aria-hidden="true" />
                <span>Evento pubblicato! Controlla i dettagli e correggi ciò che serve.</span>
            </p>
            <TransitionLink
                href={editHref}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 bg-[#d65a38] px-5 py-2 text-sm font-bold text-white no-underline hover:bg-[#b9432b] hover:no-underline"
            >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Modifica evento
            </TransitionLink>
        </div>
    );
}
