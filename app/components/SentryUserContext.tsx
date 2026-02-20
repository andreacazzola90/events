'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import * as Sentry from '@sentry/nextjs';

export default function SentryUserContext() {
    const { data: session } = useSession();

    useEffect(() => {
        const user = session?.user;

        if (user && (user.email || user.name)) {
            Sentry.setUser({
                email: user.email || undefined,
                username: user.name || undefined,
            });
            Sentry.setTag('auth', 'logged-in');
        } else {
            Sentry.setUser(null);
            Sentry.setTag('auth', 'anonymous');
        }
    }, [session]);

    return null;
}
