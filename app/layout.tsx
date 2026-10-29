import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
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
import { appBuildInfo } from "../lib/build-info";
import { getSiteUrl, siteUrl } from "../lib/site-url";
import { getWebSiteJsonLd, isPublicIndexingAllowed, serializeJsonLd } from "../lib/seo-metadata";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const allowIndexing = isPublicIndexingAllowed();

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "EventScanner | Eventi Schio e Alto Vicentino",
    template: "%s | EventScanner",
  },
  description:
    "Scopri gli eventi a Schio, Thiene, Valdagno, Vicenza e nell'Alto Vicentino. Concerti, mostre, sagre, fiere, teatro e molto altro. Calendario eventi aggiornato ogni giorno.",
  keywords: [
    "eventi schio",
    "eventi alto vicentino",
    "cosa fare schio",
    "eventi vicenza",
    "concerti schio",
    "sagre alto vicentino",
    "eventi thiene",
    "eventi valdagno",
    "eventi pedemontana veneta",
    "cosa fare nel weekend vicenza",
    "eventi weekend alto vicentino",
    "mostre schio",
    "teatro schio",
    "eventi culturali schio",
    "eventscanner",
  ],
  authors: [{ name: "EventScanner" }],
  creator: "EventScanner",
  publisher: "EventScanner",
  robots: {
    index: allowIndexing,
    follow: allowIndexing,
    googleBot: {
      index: allowIndexing,
      follow: allowIndexing,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "it_IT",
    url: siteUrl('/'),
    siteName: "EventScanner",
    title: "EventScanner | Eventi Schio e Alto Vicentino",
    description:
      "Scopri gli eventi a Schio, Thiene, Valdagno e nell'Alto Vicentino. Concerti, mostre, sagre e molto altro. Aggiornato ogni giorno.",
    images: [
      {
        url: siteUrl('/opengraph-image'),
        width: 1200,
        height: 630,
        alt: "EventScanner - Eventi Alto Vicentino",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: [siteUrl('/opengraph-image')],
    title: "EventScanner | Eventi Schio e Alto Vicentino",
    description:
      "Scopri gli eventi a Schio, Thiene, Valdagno e nell'Alto Vicentino. Aggiornato ogni giorno.",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "EventScanner",
  },
};

export const viewport = {
  themeColor: "#f1eee7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(getWebSiteJsonLd()) }}
        />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />

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
            <main className="app-main min-h-screen">
              <PageTransitionWrapper>{children}</PageTransitionWrapper>
            </main>
            <Footer
              version={appBuildInfo.version}
              builtAt={appBuildInfo.builtAt}
              builtAtLabel={appBuildInfo.builtAtLabel ?? (
                process.env.NODE_ENV === "development"
                  ? "Sviluppo locale"
                  : "Data build non disponibile"
              )}
            />
            <Analytics />
          </PageTransitionProvider>
        </Providers>
      </body>
    </html>
  );
}
