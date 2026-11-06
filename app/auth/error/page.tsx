import { Suspense } from 'react';
import AuthError from './AuthError';
import LoadingAnimation from '../../components/LoadingAnimation';

export default function AuthErrorPage() {
    return (
        <Suspense fallback={<LoadingAnimation message="Caricamento accesso..." className="min-h-screen" />}>
            <AuthError />
        </Suspense>
    );
}