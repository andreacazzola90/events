import { Suspense } from 'react';
import AuthError from './AuthError';

export default function AuthErrorPage() {
    return (
        <Suspense fallback={<div>Caricamento...</div>}>
            <AuthError />
        </Suspense>
    );
}