'use client';

import { signOut } from 'next-auth/react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

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

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                    Disconnessione in corso...
                </h2>
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            </div>
        </div>
    );
}