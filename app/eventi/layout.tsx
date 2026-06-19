import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Eventi | Schio e Alto Vicentino",
  description:
    "Tutti gli eventi a Schio, Thiene, Valdagno e nell'Alto Vicentino. Concerti, mostre, sagre, fiere, sport e cultura. Filtra e cerca per trovare cosa fare.",
  keywords: [
    "eventi schio",
    "eventi alto vicentino",
    "concerti schio",
    "sagre alto vicentino",
    "cosa fare schio",
    "eventi thiene",
    "eventi valdagno",
    "eventi pedemontana veneta",
  ],
  alternates: {
    canonical: "https://events-scanner.vercel.app/eventi",
  },
  openGraph: {
    title: "Eventi | Schio e Alto Vicentino",
    description:
      "Tutti gli eventi a Schio e nell'Alto Vicentino. Concerti, sagre, mostre e sport. Aggiornato ogni giorno.",
    url: "https://events-scanner.vercel.app/eventi",
    type: "website",
    locale: "it_IT",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
