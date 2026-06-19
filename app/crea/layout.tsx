import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Crea evento | EventScanner",
  description:
    "Aggiungi un nuovo evento a Schio, Thiene, Valdagno o nell'Alto Vicentino. Carica un'immagine e l'AI rileva automaticamente data, luogo e dettagli dell'evento.",
  keywords: [
    "crea evento schio",
    "aggiungi evento alto vicentino",
    "pubblicare evento vicenza",
    "inserire evento eventscanner",
  ],
  robots: { index: false, follow: true },
  alternates: {
    canonical: "https://events-scanner.vercel.app/crea",
  },
  openGraph: {
    title: "Crea evento | EventScanner",
    description:
      "Aggiungi un evento a Schio e nell'Alto Vicentino. L'AI rileva automaticamente tutti i dettagli dall'immagine.",
    url: "https://events-scanner.vercel.app/crea",
    type: "website",
    locale: "it_IT",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
