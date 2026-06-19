import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tutti gli eventi | Schio e Alto Vicentino",
  description:
    "Calendario completo degli eventi a Schio, Thiene, Valdagno e nell'Alto Vicentino. Concerti, sagre, mostre, fiere, teatro e sport. Filtra per mese e trova cosa fare.",
  keywords: [
    "tutti gli eventi schio",
    "calendario eventi alto vicentino",
    "eventi schio 2025",
    "concerti alto vicentino",
    "sagre schio",
    "cosa fare schio",
    "eventi thiene",
    "eventi valdagno",
    "eventi weekend vicenza",
  ],
  alternates: {
    canonical: "https://events-scanner.vercel.app/tutti-gli-eventi",
  },
  openGraph: {
    title: "Tutti gli eventi | Schio e Alto Vicentino",
    description:
      "Calendario completo degli eventi a Schio, Thiene, Valdagno e nell'Alto Vicentino. Aggiornato ogni giorno.",
    url: "https://events-scanner.vercel.app/tutti-gli-eventi",
    type: "website",
    locale: "it_IT",
  },
  twitter: {
    card: "summary",
    title: "Tutti gli eventi | Schio e Alto Vicentino",
    description:
      "Calendario completo degli eventi a Schio e nell'Alto Vicentino. Aggiornato ogni giorno.",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
