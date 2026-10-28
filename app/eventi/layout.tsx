import type { Metadata } from "next";
import { publicPageMetadata } from "../../lib/seo-metadata";

export const metadata: Metadata = publicPageMetadata({
  path: '/eventi',
  title: "Eventi | Schio e Alto Vicentino",
  description:
    "Tutti gli eventi a Schio, Thiene, Valdagno e nell'Alto Vicentino. Concerti, mostre, sagre, fiere, sport e cultura. Filtra e cerca per trovare cosa fare.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
