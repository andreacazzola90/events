"use client";

import EventList from "../components/EventList";

export default function EventiPage() {
  return (
    <main className="min-h-screen py-12 md:py-20">
      <div className="editorial-container">
        <div className="mb-12 page-heading">
          <p className="section-kicker">01 / Il programma</p>
          <h1 className="text-5xl md:text-7xl font-black mb-4 uppercase tracking-tight">Eventi<span className="site-brand-accent">.</span></h1>
          <p className="text-base text-black/60">
            Tutti gli eventi disponibili, con filtri e ricerca completa.
          </p>
        </div>

        <div>
          <EventList mode="full" />
        </div>
      </div>
    </main>
  );
}
