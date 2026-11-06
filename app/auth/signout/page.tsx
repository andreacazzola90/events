'use client';

import { signOut } from 'next-auth/react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LoadingAnimation from '../../components/LoadingAnimation';

export default function SignOut() {
    const router = useRouter();

    useEffect(() => {
        const performSignOut = async () => {
            await signOut({ redirect: false });
            router.push('/');
            router.refresh();
        };

        performSignOut();
    }, [router]);

    return <LoadingAnimation message="Disconnessione in corso..." className="min-h-screen" />;
}