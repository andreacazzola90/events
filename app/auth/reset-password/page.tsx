"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import PageHeading from "../../components/PageHeading";
import LoadingAnimation from "../../components/LoadingAnimation";

const inputClassName = "w-full border border-[var(--line)] bg-[var(--background-soft)] px-4 py-3 text-[var(--foreground)] placeholder:text-[var(--foreground-muted)]";

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
          <div className="surface-panel max-w-md mx-auto p-6 md:p-10 space-y-6">
            <div className="text-center">
              <div aria-hidden="true" className="w-16 h-16 bg-[var(--accent-soft)] flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🔐</span>
              </div>
              <PageHeading
                className="page-heading-compact page-heading-centered"
                kicker="EventScanner / Account"
                title="Nuova password"
                description="Imposta una nuova password per il tuo account."
              />
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              {error && <div role="alert" className="border border-red-500/40 bg-red-500/15 px-4 py-3 text-red-200 text-sm">{error}</div>}
              {success && <div role="status" className="border border-emerald-500/40 bg-emerald-500/15 px-4 py-3 text-emerald-200 text-sm">{success}</div>}

              <div>
                <label htmlFor="reset-password" className="block text-sm font-semibold mb-2">Nuova password</label>
                <input
                  id="reset-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClassName}
                  placeholder="Almeno 8 caratteri"
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label htmlFor="reset-password-confirm" className="block text-sm font-semibold mb-2">Conferma password</label>
                <input
                  id="reset-password-confirm"
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
              <Link href="/auth" className="text-[var(--accent-ink)] font-semibold underline underline-offset-4">
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
    <Suspense fallback={<LoadingAnimation message="Caricamento reimpostazione password..." className="min-h-screen" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
