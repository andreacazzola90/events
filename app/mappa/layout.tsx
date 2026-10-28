import type { Metadata } from "next";
import { publicPageMetadata } from "../../lib/seo-metadata";

export const metadata: Metadata = publicPageMetadata({
  path: '/mappa',
  title: "Mappa eventi | Schio e Alto Vicentino",
  description:
    "Esplora sulla mappa gli eventi in corso a Schio, Thiene, Valdagno e in tutto l'Alto Vicentino. Scopri concerti, sagre e manifestazioni vicino a te.",
});

export const revalidate = 60;

export default async function Layout({ children }: { children: React.ReactNode }) {
  const { getPublicCalendarEvents } = await import("../../lib/public-event-list");
  const { PublicEventsProvider } = await import("../components/PublicEventsProvider");
  const events = await getPublicCalendarEvents();
  return <PublicEventsProvider events={events}>{children}</PublicEventsProvider>;
}
