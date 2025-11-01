"use client";
import { useEffect, useState } from 'react';

export default function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [showPrompt, setShowPrompt] = useState(false);

    useEffect(() => {
        const handler = (e: Event) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Save the event so it can be triggered later
            setDeferredPrompt(e);
            // Show custom install prompt
            setShowPrompt(true);
        };

        window.addEventListener('beforeinstallprompt', handler);

        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
        };
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;

        // Show the install prompt
        deferredPrompt.prompt();

        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;

        console.log(`User response to the install prompt: ${outcome}`);

        // Clear the deferredPrompt
        setDeferredPrompt(null);
        setShowPrompt(false);
    };

    const handleDismiss = () => {
        setShowPrompt(false);
    };

    if (!showPrompt) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-50 animate-slideUp">
            <div className="flex items-start gap-3">
                <div className="shrink-0 text-3xl">
                    📅
                </div>
                <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">
                        Installa EventScanner
                    </h3>
                    <p className="text-sm text-gray-600 mb-3">
                        Aggiungi l&apos;app alla schermata home per un accesso rapido
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={handleInstall}
                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                        >
                            Installa
                        </button>
                        <button
                            onClick={handleDismiss}
                            className="px-4 py-2 text-gray-600 hover:text-gray-800 transition text-sm"
                        >
                            Chiudi
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}