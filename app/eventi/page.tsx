import EventList from "../components/EventList";
import { getPublicEventList } from "../../lib/public-event-list";
import { calendarToday } from "../../lib/calendar-view";

export const revalidate = 60;

export default async function EventiPage() {
  const initialToday = calendarToday();
  const initialEvents = await getPublicEventList(undefined, initialToday);
  return (
    <main className="events-page min-h-screen page-shell">
      <div className="editorial-container">
        <div className="mb-10 md:mb-14 page-heading">
          <p className="section-kicker mb-4">Schio e Alto Vicentino / Oggi</p>
          <h1 className="section-title mb-4">
            Eventi<span className="site-brand-accent">.</span>
          </h1>
          <p className="section-lead m-0">
            Cultura, musica e appuntamenti da vivere vicino a te.
          </p>
        </div>

        <div className="surface-panel p-3 md:p-5">
          <EventList mode="full" initialEvents={initialEvents} initialToday={initialToday} />
        </div>
      </div>
    </main>
  );
}
