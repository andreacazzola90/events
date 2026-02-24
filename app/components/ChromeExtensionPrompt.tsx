'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

const DISMISS_KEY = 'chrome-extension-install-prompt-dismissed-v1';

export default function ChromeExtensionPrompt() {
  const [visible, setVisible] = useState(false);

  const isDesktopChrome = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    return /Chrome/i.test(ua) && !/Edg|OPR|Android|iPhone|iPad/i.test(ua);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isDesktopChrome) return;

    const dismissed = window.localStorage.getItem(DISMISS_KEY) === '1';
    if (!dismissed) {
      setVisible(true);
    }
  }, [isDesktopChrome]);

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, '1');
    }
    setVisible(false);
  };

  if (!visible) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto px-6 pt-6">
      <div className="rounded-2xl border border-blue-400/30 bg-blue-500/10 p-4 md:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm md:text-base font-semibold text-blue-100">
              Installa l’estensione Chrome per creare eventi da screenshot o immagini.
            </p>
            <p className="text-xs md:text-sm text-blue-200/90 mt-1">
              L’installazione non è automatica: segui la guida con i passaggi "Load unpacked" da chrome://extensions.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="btn btn-sm btn-ghost text-blue-100"
            aria-label="Chiudi suggerimento installazione estensione"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/estensione" className="btn btn-sm btn-primary">
            Vedi guida installazione
          </Link>
          <button
            type="button"
            onClick={handleDismiss}
            className="btn btn-sm btn-outline"
          >
            Non mostrare più
          </button>
        </div>
      </div>
    </div>
  );
}
