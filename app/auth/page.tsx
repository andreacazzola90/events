'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

const authInputClassName = 'w-full border border-black/20 px-4 py-3 text-black placeholder:text-black/40 caret-black focus:outline-none focus:border-black transition-colors bg-white text-sm';

function AuthPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { data: session, status } = useSession();
    const requestedMode = searchParams?.get('mode');
    const view = requestedMode === 'register'
        ? 'register'
        : requestedMode === 'forgot'
            ? 'forgot'
            : 'login';

    useEffect(() => {
        if (session) {
            router.replace('/me');
        }
    }, [session, router]);

    if (status === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-black/20 border-t-black animate-spin" />
            </div>
        );
    }

    return (
        <main className="min-h-screen flex items-center justify-center auth-page bg-white">
            <div className="w-full max-w-md mx-auto px-6 py-16">

                <div className="mb-10">
                    <p className="section-kicker mb-3">EventScanner</p>
                    <h1 className="text-4xl font-black tracking-tight leading-tight mb-2">
                        {view === 'login' ? 'Accedi al tuo account' : view === 'forgot' ? 'Recupera password' : 'Crea un account'}
                    </h1>
                    <p className="text-black/55 text-sm">
                        {view === 'login'
                            ? 'Inserisci le tue credenziali per continuare.'
                            : view === 'forgot'
                                ? 'Ti invieremo un link per reimpostare la password.'
                                : 'Registrati per salvare i tuoi eventi preferiti.'}
                    </p>
                </div>

                <div className="mono-divider mb-8" />

                <div>
                    {view === 'login' && (
                        <>
                            <LoginForm />
                            <div className="mt-6 pt-6 border-t border-black/10 flex flex-col gap-2 text-sm text-black/60">
                                <span>
                                    Non hai un account?{' '}
                                    <button
                                        onClick={() => router.replace('/auth?mode=register')}
                                        className="text-black font-bold hover:underline"
                                    >
                                        Registrati
                                    </button>
                                </span>
                                <span>
                                    Password dimenticata?{' '}
                                    <button
                                        onClick={() => router.replace('/auth?mode=forgot')}
                                        className="text-black font-bold hover:underline"
                                    >
                                        Recupera password
                                    </button>
                                </span>
                            </div>
                        </>
                    )}
                    {view === 'forgot' && (
                        <>
                            <ForgotPasswordForm />
                            <div className="mt-6 pt-6 border-t border-black/10 text-sm text-black/60">
                                <button
                                    onClick={() => router.replace('/auth')}
                                    className="text-black font-bold hover:underline"
                                >
                                    ← Torna al login
                                </button>
                            </div>
                        </>
                    )}
                    {view === 'register' && (
                        <>
                            <RegisterForm onSuccess={() => router.replace('/auth')} />
                            <div className="mt-6 pt-6 border-t border-black/10 text-sm text-black/60">
                                Hai già un account?{' '}
                                <button
                                    onClick={() => router.replace('/auth')}
                                    className="text-black font-bold hover:underline"
                                >
                                    Accedi
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </main>
    );
}

export default function AuthPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-black/20 border-t-black animate-spin" />
            </div>
        }>
            <AuthPageContent />
        </Suspense>
    );
}

function LoginForm() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const { signIn } = await import('next-auth/react');
            const result = await signIn('credentials', {
                redirect: false,
                email,
                password,
            });

            if (result?.error) {
                setError('Email o password non corretti.');
            } else if (result?.ok) {
                router.push('/me');
                router.refresh();
            }
        } catch {
            setError('Errore durante il login. Riprova.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
                <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}
            <div>
                <label className="block text-xs uppercase tracking-[0.1em] font-bold mb-2 text-black">Email</label>
                <input
                    type="email"
                    placeholder="nome@esempio.com"
                    className={authInputClassName}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    disabled={loading}
                />
            </div>
            <div>
                <label className="block text-xs uppercase tracking-[0.1em] font-bold mb-2 text-black">Password</label>
                <input
                    type="password"
                    placeholder="••••••••"
                    className={authInputClassName}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    disabled={loading}
                />
            </div>
            <button
                type="submit"
                className="btn btn-primary w-full disabled:opacity-50"
                disabled={loading}
            >
                {loading ? (
                    <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white animate-spin" />
                        Accesso in corso...
                    </div>
                ) : (
                    'Accedi'
                )}
            </button>
        </form>
    );
}

function ForgotPasswordForm() {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [previewUrl, setPreviewUrl] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setPreviewUrl('');
        setLoading(true);

        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const payload = await res.json().catch(() => ({}));

            if (!res.ok) {
                setError(payload?.error || 'Errore durante la richiesta di recupero password.');
                return;
            }

            setSuccess(payload?.message || 'Se l\'account esiste, riceverai un link di reset.');
            setPreviewUrl(payload?.previewUrl || '');
        } catch {
            setError('Errore di rete. Riprova.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
                <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}
            {success && (
                <div className="border border-black/20 bg-black/5 px-4 py-3 text-sm text-black space-y-2">
                    <p>{success}</p>
                    {previewUrl && (
                        <a
                            href={previewUrl}
                            className="underline break-all text-xs"
                        >
                            Apri link di reset (preview locale)
                        </a>
                    )}
                </div>
            )}
            <div>
                <label className="block text-xs uppercase tracking-[0.1em] font-bold mb-2 text-black">Email</label>
                <input
                    type="email"
                    placeholder="nome@esempio.com"
                    className={authInputClassName}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    disabled={loading}
                />
            </div>
            <button
                type="submit"
                className="btn btn-primary w-full disabled:opacity-50"
                disabled={loading}
            >
                {loading ? 'Invio in corso...' : 'Invia link di recupero'}
            </button>
        </form>
    );
}

function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);
        if (password !== confirm) {
            setError('Le password non coincidono.');
            setLoading(false);
            return;
        }
        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            if (res.ok) {
                setSuccess('Registrazione completata! Ora puoi accedere.');
                setTimeout(() => onSuccess(), 1500);
            } else {
                const payload = await res.json().catch(() => ({}));
                setError(payload?.error || 'Errore durante la registrazione.');
            }
        } catch {
            setError('Errore di rete. Riprova.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
                <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}
            {success && (
                <div className="border border-black/20 bg-black/5 px-4 py-3 text-sm text-black">
                    {success}
                </div>
            )}
            <div>
                <label className="block text-xs uppercase tracking-[0.1em] font-bold mb-2 text-black">Email</label>
                <input
                    type="email"
                    placeholder="nome@esempio.com"
                    className={authInputClassName}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    disabled={loading}
                />
            </div>
            <div>
                <label className="block text-xs uppercase tracking-[0.1em] font-bold mb-2 text-black">Password</label>
                <input
                    type="password"
                    placeholder="••••••••"
                    className={authInputClassName}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    disabled={loading}
                />
            </div>
            <div>
                <label className="block text-xs uppercase tracking-[0.1em] font-bold mb-2 text-black">Conferma password</label>
                <input
                    type="password"
                    placeholder="••••••••"
                    className={authInputClassName}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    disabled={loading}
                />
            </div>
            <button
                type="submit"
                className="btn btn-primary w-full disabled:opacity-50"
                disabled={loading}
            >
                {loading ? (
                    <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white animate-spin" />
                        Creazione account...
                    </div>
                ) : (
                    'Crea account'
                )}
            </button>
        </form>
    );
}

