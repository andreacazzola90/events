"use client";

import EventList from "../components/EventList";

export default function EventiPage() {
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
          <EventList mode="full" />
        </div>
      </div>
    </main>
  );
}
