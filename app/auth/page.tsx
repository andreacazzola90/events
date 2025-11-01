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
        <main className="min-h-screen flex items-center justify-center bg-light py-8 px-2 w-full">
            <div className="container mx-auto px-8">
                <div className="bg-white rounded-2xl shadow-card p-8 md:p-12 flex flex-col md:flex-row gap-12 mx-auto">
                    {/* Login a sinistra */}
                    <div className="flex-1 border-r border-gray-200 pr-0 md:pr-8">
                        <h2 className="text-2xl font-bold mb-6 text-primary">Accedi</h2>
                        <LoginForm />
                    </div>
                    {/* Registrazione a destra */}
                    <div className="flex-1 pt-12 md:pt-0 md:pl-8">
                        <h2 className="text-2xl font-bold mb-6 text-primary">Registrati</h2>
                        <RegisterForm />
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
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded font-semibold">{error}</div>}
            <div>
                <label className="block text-sm font-semibold mb-2 text-gray-700">Email</label>
                <input
                    type="email"
                    placeholder="tua@email.com"
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary focus:border-transparent transition"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    disabled={loading}
                />
            </div>
            <div>
                <label className="block text-sm font-semibold mb-2 text-gray-700">Password</label>
                <input
                    type="password"
                    placeholder="••••••••"
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary focus:border-transparent transition"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    disabled={loading}
                />
            </div>
            <button
                type="submit"
                className="w-full bg-linear-to-r from-primary via-accent to-secondary text-white font-bold py-3 rounded-full shadow-button hover:shadow-lg transition-all disabled:opacity-50"
                disabled={loading}
            >
                {loading ? 'Accesso in corso...' : 'Accedi'}
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
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded font-semibold">{error}</div>}
            {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded font-semibold">{success}</div>}
            <div>
                <label className="block text-sm font-semibold mb-2 text-gray-700">Email</label>
                <input
                    type="email"
                    placeholder="tua@email.com"
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary focus:border-transparent transition"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    disabled={loading}
                />
            </div>
            <div>
                <label className="block text-sm font-semibold mb-2 text-gray-700">Password</label>
                <input
                    type="password"
                    placeholder="••••••••"
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary focus:border-transparent transition"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    disabled={loading}
                />
            </div>
            <div>
                <label className="block text-sm font-semibold mb-2 text-gray-700">Conferma Password</label>
                <input
                    type="password"
                    placeholder="••••••••"
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary focus:border-transparent transition"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    disabled={loading}
                />
            </div>
            <button
                type="submit"
                className="w-full bg-linear-to-r from-secondary via-accent to-primary text-white font-bold py-3 rounded-full shadow-button hover:shadow-lg transition-all disabled:opacity-50"
                disabled={loading}
            >
                {loading ? 'Registrazione in corso...' : 'Registrati'}
            </button>
        </form>
    );
}
