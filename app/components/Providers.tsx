"use client";
import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';
import { ToastContainer } from 'react-toastify';
import SentryUserContext from './SentryUserContext';
import { SiteSettingsProvider } from './SiteSettingsProvider';

export default function Providers({ children }: { children: ReactNode }) {
    return (
        <SessionProvider>
            <SiteSettingsProvider>
                <SentryUserContext />
                {children}
                <ToastContainer
                    position="top-right"
                    autoClose={5000}
                    hideProgressBar={false}
                    newestOnTop={false}
                    closeOnClick
                    pauseOnFocusLoss
                    draggable
                    pauseOnHover
                    theme="dark"
                />
            </SiteSettingsProvider>
        </SessionProvider>
    );
}
