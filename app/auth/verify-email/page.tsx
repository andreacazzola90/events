"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") || "";
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("Token di conferma mancante o non valido.");
      return;
    }

    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.error || "Errore durante la verifica dell'email.");
        }
        setStatus("success");
      })
      .catch((err) => {
        setStatus("error");
        setError((err as Error).message);
      });
  }, [token]);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="hero-section w-full">
        <div className="max-w-4xl mx-auto px-6 py-16">
          <div className="max-w-md mx-auto glass-effect rounded-3xl p-8 md:p-12 space-y-6 text-center">
            <div className="w-16 h-16 bg-linear-to-br from-pink-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">✉️</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Conferma email</h1>

            {status === "loading" && (
              <p className="text-gray-400">Verifica in corso...</p>
            )}
            {status === "success" && (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-3 text-emerald-200 text-sm">
                Email confermata con successo. Ora puoi accedere al tuo account.
              </div>
            )}
            {status === "error" && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-3 text-red-200 text-sm">
                {error}
              </div>
            )}

            <div className="text-sm text-gray-400">
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

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-2xl">Caricamento...</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
