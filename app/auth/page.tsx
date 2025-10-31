'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';

export default function AuthPage() {
    const [tab, setTab] = useState<'login' | 'register'>('login');
    const router = useRouter();

    return (
        <main className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow-lg">
                <div className="flex justify-center gap-4 mb-6">
                    <button
                        className={`px-4 py-2 rounded font-medium transition ${tab === 'login' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                        onClick={() => setTab('login')}
                    >
                        Accedi
                    </button>
                    <button
                        className={`px-4 py-2 rounded font-medium transition ${tab === 'register' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                        onClick={() => setTab('register')}
                    >
                        Registrati
                    </button>
                </div>
                {tab === 'login' ? (
                    <LoginForm />
                ) : (
                    <RegisterForm />
                )}
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
            const res = await fetch('/api/auth/signin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            if (res.ok) {
                router.push('/');
                router.refresh();
            } else {
                setError('Email o password non corretti');
            }
        } catch {
            setError('Errore di rete');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form className="space-y-6" onSubmit={handleSubmit}>
            {error && <div className="bg-red-50 text-red-700 px-4 py-2 rounded">{error}</div>}
            <input
                type="email"
                placeholder="Email"
                className="w-full border rounded px-3 py-2"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                disabled={loading}
            />
            <input
                type="password"
                placeholder="Password"
                className="w-full border rounded px-3 py-2"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                disabled={loading}
            />
            <button
                type="submit"
                className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition disabled:opacity-50"
                disabled={loading}
            >
                {loading ? 'Accesso...' : 'Accedi'}
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
            {error && <div className="bg-red-50 text-red-700 px-4 py-2 rounded">{error}</div>}
            {success && <div className="bg-green-50 text-green-700 px-4 py-2 rounded">{success}</div>}
            <input
                type="email"
                placeholder="Email"
                className="w-full border rounded px-3 py-2"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                disabled={loading}
            />
            <input
                type="password"
                placeholder="Password"
                className="w-full border rounded px-3 py-2"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                disabled={loading}
            />
            <input
                type="password"
                placeholder="Conferma Password"
                className="w-full border rounded px-3 py-2"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                disabled={loading}
            />
            <button
                type="submit"
                className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition disabled:opacity-50"
                disabled={loading}
            >
                {loading ? 'Registrazione...' : 'Registrati'}
            </button>
        </form>
    );
}
