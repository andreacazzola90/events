import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accedi o registrati | EventScanner",
  description:
    "Accedi al tuo account EventScanner per salvare i tuoi eventi preferiti a Schio e nell'Alto Vicentino.",
  robots: { index: false, follow: false },
  alternates: {
    canonical: "https://events-scanner.vercel.app/auth",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
