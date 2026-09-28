"use client";

import EventList from "../components/EventList";

export default function EventiPage() {
  return (
    <main className="min-h-screen page-shell">
      <div className="editorial-container">
        <div className="mb-10 md:mb-14 page-heading">
          <p className="section-kicker mb-4">01 / Il programma</p>
          <h1 className="section-title uppercase tracking-[-0.08em] mb-4">
            Eventi<span className="site-brand-accent">.</span>
          </h1>
          <p className="section-lead m-0">
            Tutti gli eventi disponibili, con filtri e ricerca completa.
          </p>
        </div>

        <div className="surface-panel p-3 md:p-5">
          <EventList mode="full" />
        </div>
      </div>
    </main>
  );
}
