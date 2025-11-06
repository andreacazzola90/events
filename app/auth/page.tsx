'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

export default function AuthPage() {
    const router = useRouter();
    const { data: session, status } = useSession();

    useEffect(() => {
        if (session) {
            router.replace('/account');
        }
    }, [session, router]);

    if (status === 'loading') {
        return <div className="min-h-screen flex items-center justify-center text-2xl">Caricamento...</div>;
    }

    return (
        <main className="min-h-screen flex items-center justify-center">
            <div className="hero-section w-full">
                <div className="max-w-4xl mx-auto px-6 py-16">
                    <div className="text-center mb-12">
                        <h1 className="text-5xl md:text-6xl font-black mb-6 leading-tight">
                            Join the <span className="gradient-text">community</span>
                        </h1>
                        <p className="text-xl md:text-2xl text-gray-400 mb-8 max-w-2xl mx-auto">
                            Sign in to create incredible events and connect with your audience
                        </p>
                    </div>

                    <div className="glass-effect rounded-3xl p-8 md:p-12 grid md:grid-cols-2 gap-12">
                        {/* Login Section */}
                        <div className="space-y-6">
                            <div className="text-center">
                                <div className="w-16 h-16 bg-linear-to-br from-pink-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                    <span className="text-2xl">🔑</span>
                                </div>
                                <h2 className="text-2xl font-bold text-white mb-2">Welcome Back</h2>
                                <p className="text-gray-400">Sign in to your account</p>
                            </div>
                            <LoginForm />
                        </div>

                        {/* Register Section */}
                        <div className="space-y-6 border-l border-white/10 pl-0 md:pl-8">
                            <div className="text-center">
                                <div className="w-16 h-16 bg-linear-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                    <span className="text-2xl">✨</span>
                                </div>
                                <h2 className="text-2xl font-bold text-white mb-2">Get Started</h2>
                                <p className="text-gray-400">Create your new account</p>
                            </div>
                            <RegisterForm />
                        </div>
                    </div>
                </div>
            </div>
        </main>
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
                router.push('/account');
                router.refresh();
            }
        } catch (err) {
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
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:bg-white/20 transition-all"
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
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:bg-white/20 transition-all"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    disabled={loading}
                />
            </div>
            <button
                type="submit"
                className="w-full bg-linear-to-r from-pink-500 to-purple-600 text-white font-bold py-3 rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-pink-500/25 disabled:opacity-50 disabled:hover:scale-100"
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

function RegisterForm() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

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
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white/20 transition-all"
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
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white/20 transition-all"
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
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white/20 transition-all"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    disabled={loading}
                />
            </div>
            <button
                type="submit"
                className="w-full bg-linear-to-r from-purple-500 to-pink-600 text-white font-bold py-3 rounded-lg transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-purple-500/25 disabled:opacity-50 disabled:hover:scale-100"
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
