import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mappa eventi | Schio e Alto Vicentino",
  description:
    "Esplora sulla mappa gli eventi in corso a Schio, Thiene, Valdagno e in tutto l'Alto Vicentino. Scopri concerti, sagre e manifestazioni vicino a te.",
  keywords: [
    "mappa eventi schio",
    "eventi vicino a me alto vicentino",
    "mappa eventi vicenza",
    "eventi schio mappa",
    "dove andare schio",
  ],
  alternates: {
    canonical: "https://events-scanner.vercel.app/mappa",
  },
  openGraph: {
    title: "Mappa eventi | Schio e Alto Vicentino",
    description:
      "Esplora sulla mappa gli eventi a Schio, Thiene, Valdagno e nell'Alto Vicentino.",
    url: "https://events-scanner.vercel.app/mappa",
    type: "website",
    locale: "it_IT",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
