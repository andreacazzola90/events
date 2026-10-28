import type { Metadata } from "next";
import { publicPageMetadata } from "../../lib/seo-metadata";

export const metadata: Metadata = {
  ...publicPageMetadata({
    path: '/crea',
    title: "Crea evento",
    description:
      "Aggiungi un nuovo evento a Schio, Thiene, Valdagno o nell'Alto Vicentino.",
  }),
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
