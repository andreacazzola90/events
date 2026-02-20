'use client';

import { useEffect } from 'react';

export default function PWAHandler() {
    useEffect(() => {
        // Register Service Worker (skip in development)
        if ('serviceWorker' in navigator) {
            if (process.env.NODE_ENV === 'development') {
                console.log('[PWA] Skipping Service Worker registration in development');
                return;
            }

            navigator.serviceWorker
                .register('/sw.js')
                .then((registration) => {
                    console.log('[PWA] Service Worker registered:', registration);

                    // Check for updates periodically
                    setInterval(() => {
                        registration.update();
                    }, 60 * 60 * 1000); // Every hour
                })
                .catch((error) => {
                    console.error('[PWA] Service Worker registration failed:', error);
                });
        }

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            console.log('[PWA] Install prompt available');

            // You can show a custom install button here
            // For now, we'll let the browser handle it
        });

        window.addEventListener('appinstalled', () => {
            console.log('[PWA] App installed successfully');
        });

        // Log if running as standalone PWA
        if (window.matchMedia('(display-mode: standalone)').matches) {
            console.log('[PWA] Running as standalone app');
        }

        // iOS standalone detection
        if ((navigator as any).standalone) {
            console.log('[PWA] Running as iOS standalone app');
        }
    }, []);

    return null; // This component doesn't render anything
}
