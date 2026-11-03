import EventList from "../components/EventList";
import PageHeading from "../components/PageHeading";
import { getPublicEventList } from "../../lib/public-event-list";
import { calendarToday } from "../../lib/calendar-view";

export const revalidate = 60;

export default async function EventiPage() {
  const initialToday = calendarToday();
  const initialEvents = await getPublicEventList(undefined, initialToday);
  return (
    <main className="events-page min-h-screen page-shell">
      <div className="editorial-container">
        <PageHeading
          kicker="Schio e Alto Vicentino / Oggi"
          title="Eventi"
          description="Cultura, musica e appuntamenti da vivere vicino a te."
        />

        <div className="surface-panel p-3 md:p-5">
          <EventList mode="full" initialEvents={initialEvents} initialToday={initialToday} />
        </div>
      </div>
    </main>
  );
}
