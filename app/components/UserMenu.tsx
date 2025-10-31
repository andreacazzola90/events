"use client";
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';

export default function UserMenu() {
    const { data: session, status } = useSession();

    if (status === 'loading') {
        return (
            <div className="flex items-center gap-4">
                <span className="text-gray-500">Caricamento...</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-4">
            {session ? (
                <>
                    <span className="text-gray-700 font-medium">
                        Ciao, {session.user?.name || session.user?.email}
                    </span>
                    <button
                        onClick={() => signOut({ callbackUrl: '/' })}
                        className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
                    >
                        Logout
                    </button>
                </>
            ) : (
                <>
                    <Link
                        href="/auth/signin"
                        className="px-4 py-2 text-blue-600 font-medium hover:text-blue-700 transition"
                    >
                        Accedi
                    </Link>
                    <Link
                        href="/auth/register"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                        Registrati
                    </Link>
                </>
            )}
        </div>
    );
}