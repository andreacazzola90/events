"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

const inputClassName = "w-full rounded-2xl bg-white/95 border border-white/70 px-4 py-3 text-gray-900 placeholder:text-gray-500 caret-gray-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm focus:outline-none focus:bg-white focus:border-transparent focus:ring-2 focus:ring-pink-500 focus:shadow-[0_16px_40px_rgba(15,23,42,0.14)] transition-all";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!token) {
      setError("Token di recupero mancante o non valido.");
      return;
    }

    if (password.length < 8) {
      setError("La nuova password deve contenere almeno 8 caratteri.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Le password non coincidono.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, password }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(payload?.error || "Errore durante il reset della password.");
        return;
      }

      setSuccess("Password aggiornata. Ora puoi accedere con la nuova password.");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError((err as Error).message || "Errore durante il reset della password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="hero-section w-full">
        <div className="max-w-4xl mx-auto px-6 py-16">
          <div className="max-w-md mx-auto glass-effect rounded-3xl p-8 md:p-12 space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-linear-to-br from-pink-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🔐</span>
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Nuova password</h1>
              <p className="text-gray-400">Imposta una nuova password per il tuo account.</p>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              {error && <div className="rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-3 text-red-200 text-sm">{error}</div>}
              {success && <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-3 text-emerald-200 text-sm">{success}</div>}

              <div>
                <label className="block text-sm font-semibold mb-2 text-white">Nuova password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClassName}
                  placeholder="Almeno 8 caratteri"
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2 text-white">Conferma password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClassName}
                  placeholder="Ripeti la password"
                  autoComplete="new-password"
                />
              </div>

              <button type="submit" disabled={loading} className="btn btn-primary w-full font-bold disabled:opacity-50">
                {loading ? "Aggiornamento..." : "Salva nuova password"}
              </button>
            </form>

            <div className="text-center text-sm text-gray-400">
              <Link href="/auth" className="text-pink-400 hover:text-pink-300 font-semibold transition-colors">
                Torna al login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-2xl">Caricamento...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
