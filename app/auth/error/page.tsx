'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function AuthError() {
    const searchParams = useSearchParams();
    const error = searchParams?.get('error');

    let errorMessage = 'Si è verificato un errore durante l\'autenticazione';

    if (error === 'CredentialsSignin') {
        errorMessage = 'Email o password non corretti';
    } else if (error === 'AccessDenied') {
        errorMessage = 'Accesso negato';
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        Errore di autenticazione
                    </h2>
                    <div className="mt-4 rounded-md bg-red-50 p-4">
                        <div className="text-sm text-red-800">{errorMessage}</div>
                    </div>
                </div>
                <div className="text-center space-y-4">
                    <Link
                        href="/auth/signin"
                        className="font-medium text-indigo-600 hover:text-indigo-500"
                    >
                        Torna al login
                    </Link>
                    <br />
                    <Link
                        href="/"
                        className="font-medium text-indigo-600 hover:text-indigo-500"
                    >
                        Torna alla homepage
                    </Link>
                </div>
            </div>
        </div>
    );
}