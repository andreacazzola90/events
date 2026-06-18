'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

const authInputClassName = 'w-full rounded-none border border-gray-300 px-4 py-3 text-gray-900 placeholder:text-gray-500 caret-gray-900 focus:outline-none focus:border-black transition-colors';

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
        return <div className="min-h-screen flex items-center justify-center text-2xl">Caricamento...</div>;
    }

    return (
        <main className="min-h-screen flex items-center justify-center auth-page">
            <div className="hero-section w-full">
                <div className="max-w-4xl mx-auto px-6 py-16">
                    <div className="text-center mb-12">
                        <h1 className="text-5xl md:text-6xl font-black mb-6 leading-tight">
                            {view === 'login' ? (
                                <>Join the <span className="gradient-text">community</span></>
                            ) : view === 'forgot' ? (
                                <>Reset your <span className="gradient-text">password</span></>
                            ) : (
                                <>Create your <span className="gradient-text">account</span></>
                            )}
                        </h1>
                        <p className="text-xl md:text-2xl text-gray-400 mb-8 max-w-2xl mx-auto">
                            {view === 'login'
                                ? "Sign in to create incredible events and connect with your audience"
                                : view === 'forgot'
                                    ? "Request a secure link to set a new password for your account"
                                : "Join thousands of creators making an impact in their communities"}
                        </p>
                    </div>

                    <div className="max-w-md mx-auto">
                        <div className="glass-effect rounded-3xl p-8 md:p-12">
                            {view === 'login' ? (
                                <div className="space-y-6">
                                    <div className="text-center">
                                        <div className="w-16 h-16 bg-linear-to-br from-pink-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                            <span className="text-2xl">🔑</span>
                                        </div>
                                        <h2 className="text-2xl font-bold text-white mb-2">Welcome Back</h2>
                                        <p className="text-gray-400 mb-6">Sign in to your account</p>
                                    </div>
                                    <LoginForm />
                                    <div className="pt-6 border-t border-white/10 text-center">
                                        <p className="text-gray-400">
                                            Don't have an account?{' '}
                                            <button
                                                onClick={() => router.replace('/auth?mode=register')}
                                                className="text-pink-400 hover:text-pink-300 font-semibold transition-colors"
                                            >
                                                Mostra registrazione
                                            </button>
                                        </p>
                                    </div>
                                </div>
                            ) : view === 'forgot' ? (
                                <div className="space-y-6">
                                    <div className="text-center">
                                        <div className="w-16 h-16 bg-linear-to-br from-amber-500 to-pink-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                            <span className="text-2xl">📨</span>
                                        </div>
                                        <h2 className="text-2xl font-bold text-white mb-2">Recupera password</h2>
                                        <p className="text-gray-400 mb-6">Ti inviamo un link sicuro per reimpostarla</p>
                                    </div>
                                    <ForgotPasswordForm />
                                    <div className="pt-6 border-t border-white/10 text-center">
                                        <button
                                            onClick={() => router.replace('/auth')}
                                            className="text-pink-400 hover:text-pink-300 font-semibold transition-colors"
                                        >
                                            Torna al login
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="text-center">
                                        <div className="w-16 h-16 bg-linear-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                            <span className="text-2xl">✨</span>
                                        </div>
                                        <h2 className="text-2xl font-bold text-white mb-2">Get Started</h2>
                                        <p className="text-gray-400 mb-6">Create your new account</p>
                                    </div>
                                    <RegisterForm />
                                    <div className="pt-6 border-t border-white/10 text-center">
                                        <p className="text-gray-400">
                                            Already have an account?{' '}
                                            <button
                                                onClick={() => router.replace('/auth')}
                                                className="text-purple-400 hover:text-purple-300 font-semibold transition-colors"
                                            >
                                                Torna al login
                                            </button>
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}

export default function AuthPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-2xl">Caricamento...</div>}>
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
            // Usa signIn da next-auth invece di fetch custom
            const { signIn } = await import('next-auth/react');
            const result = await signIn('credentials', {
                redirect: false,
                email,
                password,
            });

            if (result?.error) {
                setError('Email o password non corretti');
            } else if (result?.ok) {
                // Login riuscito, reindirizza e ricarica la sessione
                router.push('/me');
                router.refresh();
            }
        } catch {
            setError('Errore durante il login');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
                <div className="glass-effect border-red-500/50 bg-red-500/10 p-4 rounded-lg">
                    <div className="flex items-center gap-3">
                        <span className="text-red-400 text-xl">⚠️</span>
                        <p className="text-red-300">{error}</p>
                    </div>
                </div>
            )}
            <div>
                <label className="block text-sm font-semibold mb-2 text-white">Email</label>
                <input
                    type="email"
                    placeholder="your@email.com"
                    className={`${authInputClassName} focus:ring-pink-500`}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    disabled={loading}
                />
            </div>
            <div>
                <label className="block text-sm font-semibold mb-2 text-white">Password</label>
                <input
                    type="password"
                    placeholder="••••••••"
                    className={`${authInputClassName} focus:ring-pink-500`}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    disabled={loading}
                />
            </div>
            <div className="flex justify-end -mt-2">
                <button
                    type="button"
                    onClick={() => router.replace('/auth?mode=forgot')}
                    className="text-sm text-pink-400 hover:text-pink-300 font-semibold transition-colors"
                >
                    Recupera password
                </button>
            </div>
            <button
                type="submit"
                className="btn btn-primary w-full font-bold disabled:opacity-50"
                disabled={loading}
            >
                {loading ? (
                    <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Signing in...
                    </div>
                ) : (
                    '🔑 Sign In'
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
                setError(payload?.error || 'Errore durante la richiesta di recupero password');
                return;
            }

            setSuccess(payload?.message || 'Se l\'account esiste, riceverai un link di reset.');
            setPreviewUrl(payload?.previewUrl || '');
        } catch {
            setError('Errore di rete');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
                <div className="glass-effect border-red-500/50 bg-red-500/10 p-4 rounded-lg">
                    <div className="flex items-center gap-3">
                        <span className="text-red-400 text-xl">⚠️</span>
                        <p className="text-red-300">{error}</p>
                    </div>
                </div>
            )}
            {success && (
                <div className="glass-effect border-emerald-500/50 bg-emerald-500/10 p-4 rounded-lg space-y-3">
                    <div className="flex items-center gap-3">
                        <span className="text-emerald-400 text-xl">✅</span>
                        <p className="text-emerald-300">{success}</p>
                    </div>
                    {previewUrl && (
                        <a
                            href={previewUrl}
                            className="text-amber-300 hover:text-amber-200 underline break-all text-sm inline-block"
                        >
                            Apri link di reset (preview locale)
                        </a>
                    )}
                </div>
            )}
            <div>
                <label className="block text-sm font-semibold mb-2 text-white">Email</label>
                <input
                    type="email"
                    placeholder="your@email.com"
                    className={`${authInputClassName} focus:ring-amber-500`}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    disabled={loading}
                />
            </div>
            <button
                type="submit"
                className="btn btn-primary w-full disabled:opacity-50"
                disabled={loading}
            >
                {loading ? 'Invio link...' : 'Invia link di recupero'}
            </button>
        </form>
    );
}

function RegisterForm() {
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
            setError('Le password non coincidono');
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
                setSuccess('Registrazione avvenuta! Ora puoi accedere.');
                setEmail('');
                setPassword('');
                setConfirm('');
            } else {
                setError('Errore durante la registrazione');
            }
        } catch {
            setError('Errore di rete');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
                <div className="glass-effect border-red-500/50 bg-red-500/10 p-4 rounded-lg">
                    <div className="flex items-center gap-3">
                        <span className="text-red-400 text-xl">⚠️</span>
                        <p className="text-red-300">{error}</p>
                    </div>
                </div>
            )}
            {success && (
                <div className="glass-effect border-green-500/50 bg-green-500/10 p-4 rounded-lg">
                    <div className="flex items-center gap-3">
                        <span className="text-green-400 text-xl">✅</span>
                        <p className="text-green-300">{success}</p>
                    </div>
                </div>
            )}
            <div>
                <label className="block text-sm font-semibold mb-2 text-white">Email</label>
                <input
                    type="email"
                    placeholder="your@email.com"
                    className={`${authInputClassName} focus:ring-purple-500`}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    disabled={loading}
                />
            </div>
            <div>
                <label className="block text-sm font-semibold mb-2 text-white">Password</label>
                <input
                    type="password"
                    placeholder="••••••••"
                    className={`${authInputClassName} focus:ring-purple-500`}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    disabled={loading}
                />
            </div>
            <div>
                <label className="block text-sm font-semibold mb-2 text-white">Confirm Password</label>
                <input
                    type="password"
                    placeholder="••••••••"
                    className={`${authInputClassName} focus:ring-purple-500`}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
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
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Creating account...
                    </div>
                ) : (
                    '✨ Create Account'
                )}
            </button>
        </form>
    );
}
