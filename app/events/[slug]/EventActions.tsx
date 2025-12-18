'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface EventActionsProps {
    slug: string;
    imageUrl?: string | null;
}

export default function EventActions({ slug, imageUrl }: EventActionsProps) {
    const router = useRouter();
    const { data: session } = useSession();

    return (
        <>
            {/* Back Button - Fixed position */}
            <button
                onClick={() => router.back()}
                className="mb-6 w-12 h-12 rounded-full bg-white/70 backdrop-blur-sm hover:bg-white/90 shadow-lg flex items-center justify-center transition-all"
                aria-label="Torna indietro"
            >
                <span className="text-2xl">←</span>
            </button>

            {/* Edit Button - Float over image if logged in */}
            {session && (
                <button
                    onClick={() => router.push(`/events/${slug}/edit`)}
                    className="absolute top-6 right-6 z-10 px-4 py-2 rounded-full font-bold shadow-button bg-linear-to-r from-secondary via-accent to-primary text-white hover:shadow-lg transition-all opacity-0 group-hover:opacity-100"
                >
                    ✏️ Modifica
                </button>
            )}
        </>
    );
}
