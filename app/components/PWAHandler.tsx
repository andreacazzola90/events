'use client';

import { useEffect } from 'react';

export default function PWAHandler() {
    useEffect(() => {
        if (typeof window === 'undefined') return;

        if ('serviceWorker' in navigator) {
            if (process.env.NODE_ENV === 'development') {
                console.log('[PWA] Skipping Service Worker registration in development');
                return;
            }

            navigator.serviceWorker
                .register('/sw.js', { scope: '/' })
                .then((registration) => {
                    console.log('[PWA] Service Worker registered:', registration);

                    const updateInterval = window.setInterval(() => {
                        registration.update();
                    }, 60 * 60 * 1000);

                    return () => window.clearInterval(updateInterval);
                })
                .catch((error) => {
                    console.error('[PWA] Service Worker registration failed:', error);
                });
        }

        const handleBeforeInstallPrompt = (event: Event) => {
            event.preventDefault();
            console.log('[PWA] Install prompt available');

            const promptEvent = event as BeforeInstallPromptEvent;
            if (promptEvent && typeof promptEvent.preventDefault === 'function') {
                promptEvent.preventDefault();
            }
        };

        const handleAppInstalled = () => {
            console.log('[PWA] App installed successfully');
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);

        if (window.matchMedia('(display-mode: standalone)').matches) {
            console.log('[PWA] Running as standalone app');
        }

        if ((navigator as any).standalone) {
            console.log('[PWA] Running as iOS standalone app');
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    return null;
}

type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};
