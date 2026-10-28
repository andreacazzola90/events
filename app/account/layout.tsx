import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Il mio account | EventScanner",
  description:
    "Gestisci il tuo profilo, i tuoi eventi salvati e i preferiti su EventScanner — il calendario eventi di Schio e Alto Vicentino.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
