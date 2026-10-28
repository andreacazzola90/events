import type { Metadata } from "next";
import { publicPageMetadata } from "../../lib/seo-metadata";

export const metadata: Metadata = publicPageMetadata({
  path: '/tutti-gli-eventi',
  title: "Tutti gli eventi | Schio e Alto Vicentino",
  description:
    "Calendario completo degli eventi a Schio, Thiene, Valdagno e nell'Alto Vicentino. Concerti, sagre, mostre, fiere, teatro e sport. Filtra per mese e trova cosa fare.",
});

export const revalidate = 60;

export default async function Layout({ children }: { children: React.ReactNode }) {
  const { getPublicCalendarEvents } = await import("../../lib/public-event-list");
  const { PublicEventsProvider } = await import("../components/PublicEventsProvider");
  const { calendarToday } = await import("../../lib/calendar-view");
  const today = calendarToday();
  const events = await getPublicCalendarEvents(today);
  return <PublicEventsProvider events={events} today={today}>{children}</PublicEventsProvider>;
}
