"use client";
import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import SentryUserContext from './SentryUserContext';

export default function Providers({ children }: { children: ReactNode }) {
    return (
        <SessionProvider>
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
        </SessionProvider>
    );
}
