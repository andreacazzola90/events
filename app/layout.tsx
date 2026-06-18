import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import Header from "./components/Header";
import Footer from "./components/Footer";
import Providers from "./components/Providers";
import PWAHandler from "./components/PWAHandler";
import { PageTransitionProvider } from "./lib/PageTransitionContext";
import { LoadingIndicator } from "./components/LoadingIndicator";
import { PageTransitionWrapper } from "./components/PageTransition";
import { GoogleAnalytics } from "./lib/analytics";
import { GoogleTagManager } from "./lib/gtm";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "EventScanner - Scansiona e gestisci i tuoi eventi",
  description:
    "Carica immagini di eventi e ottieni automaticamente tutte le informazioni con AI",
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
  const googleSiteVerification =
    process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
  return (
    <html lang="it" data-theme="dicefm">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <meta name="theme-color" content="#2563eb" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="EventScanner" />

        {/* Google Search Console Verification */}
        {googleSiteVerification && (
          <meta
            name="google-site-verification"
            content={googleSiteVerification}
          />
        )}

        {/* Google Analytics */}
        <GoogleAnalytics />

        {/* Google Tag Manager */}
        <GoogleTagManager />
      </head>
      <body className={`${inter.variable} antialiased`}>
        <Providers>
          <PageTransitionProvider>
            <PWAHandler />
            <LoadingIndicator />
            <Header />
            <main className="min-h-screen pt-16">
              <PageTransitionWrapper>{children}</PageTransitionWrapper>
            </main>
            <Footer />
            <Analytics />
          </PageTransitionProvider>
        </Providers>
      </body>
    </html>
  );
}
