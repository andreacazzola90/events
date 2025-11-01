"use client";
import { useSession, signOut } from 'next-auth/react';

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
                    <span className="text-gray-700 font-medium hidden sm:inline">
                        Ciao, {session.user?.name || session.user?.email}
                    </span>
                    <button
                        onClick={() => signOut({ callbackUrl: '/' })}
                        className="relative flex flex-col items-center group text-2xl text-red-500 hover:text-red-700 transition"
                        aria-label="Logout"
                    >
                        <span>🚪</span>
                        <span className="absolute left-1/2 -translate-x-1/2 mt-8 px-2 py-1 rounded bg-gray-900 text-white text-xs opacity-0 group-hover:opacity-100 pointer-events-none z-10 whitespace-nowrap">
                            Logout
                        </span>
                    </button>
                </>
            ) : null}
        </div>
    );
}