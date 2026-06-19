"use client";

import EventList from "./components/EventList";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-black">
      <section className="hero-section border-b border-black/10">
        <div className="editorial-container py-10 md:py-14">
          <p className="section-kicker mb-3">Alto vicentino</p>
          <h1 className="section-title max-w-5xl">
            Dove andrai stasera: eventi, concerti, mostre e cose da fare in
            città.
          </h1>
          <p className="text-base md:text-lg text-black/65 max-w-3xl mb-7">
            Una selezione aggiornata ogni giorno con date, posti e link utili.
            Cerca per periodo e salva i tuoi preferiti.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/tutti-gli-eventi"
              className="inline-flex items-center h-11 px-5 bg-black text-white text-xs uppercase tracking-[0.14em] font-bold no-underline hover:no-underline hover:bg-black/90 hover:text-white focus:text-white active:text-white"
            >
              Tutti gli eventi
            </Link>
            <Link
              href="/mappa"
              className="inline-flex items-center h-11 px-5 border border-black text-black text-xs uppercase tracking-[0.14em] font-bold no-underline hover:no-underline"
            >
              Mappa
            </Link>
            <Link
              href="/crea"
              className="inline-flex items-center h-11 px-5 border border-black/20 text-black text-xs uppercase tracking-[0.14em] font-bold no-underline hover:no-underline"
            >
              Crea evento
            </Link>
          </div>
        </div>
      </section>

      <section className="py-10 md:py-14">
        <div className="editorial-container">
          <div className="flex items-end justify-between mb-6 gap-4">
            <div>
              <p className="section-kicker mb-2">Dove andrà EventScanner</p>
              <h2 className="text-3xl md:text-4xl font-black tracking-tight mb-0">
                Eventi per periodo
              </h2>
            </div>
            <p className="hidden md:block text-sm text-black/50 m-0">
              oggi · domani · weekend · settimana
            </p>
          </div>

          <div className="mono-divider mb-6"></div>

          <div className="animate-fadeInUp">
            <EventList mode="quick" />
          </div>

          <div className="mt-8">
            <Link
              href="/tutti-gli-eventi"
              className="inline-flex items-center h-10 px-4 border border-black/25 text-[11px] uppercase tracking-[0.14em] font-bold text-black no-underline hover:no-underline"
            >
              Vedi archivio completo
            </Link>
          </div>
        </div>
      </section>

      <section className="py-12 border-t border-black/10">
        <div className="editorial-container">
          <blockquote className="text-xl md:text-2xl font-semibold tracking-tight max-w-4xl m-0">
            «La vita è così amara, il vino è così dolce; perché dunque non
            bere?»
          </blockquote>
          <p className="text-sm uppercase tracking-[0.12em] text-black/55 mt-3 mb-0">
            Umberto Saba
          </p>
        </div>
      </section>
    </main>
  );
}
