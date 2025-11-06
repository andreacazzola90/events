import type { Metadata } from "next";
import { Inter } from 'next/font/google';
import "./globals.css";
import "leaflet/dist/leaflet.css";
import Header from './components/Header';
import Providers from './components/Providers';
import InstallPrompt from './components/InstallPrompt';
import { PageTransitionProvider } from './lib/PageTransitionContext';
import { LoadingIndicator } from './components/LoadingIndicator';
import { PageTransitionWrapper } from './components/PageTransition';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: "EventScanner - Scansiona e gestisci i tuoi eventi",
  description: "Carica immagini di eventi e ottieni automaticamente tutte le informazioni con AI",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "EventScanner",
  },
};

export const viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <meta name="theme-color" content="#2563eb" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="EventScanner" />
      </head>
      <body className={`${inter.variable} antialiased`}>
        <Providers>
          <PageTransitionProvider>
            <LoadingIndicator />
            <Header />
            <main className="min-h-screen pt-16">
              <PageTransitionWrapper>
                {children}
              </PageTransitionWrapper>
            </main>
            <InstallPrompt />
          </PageTransitionProvider>
        </Providers>
        <script dangerouslySetInnerHTML={{
          __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('Service Worker registered'))
                .catch(err => console.log('Service Worker registration failed', err));
            });
          }
        `}} />
      </body>
    </html>
  );
}
