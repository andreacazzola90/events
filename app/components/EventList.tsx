"use client";

import Image from "next/image";
import { useState, useEffect, useCallback, useRef } from "react";
import { gsap } from "gsap";
import { generateUniqueSlug } from "../../lib/slug-utils";
import { getEventStartTime } from "../../lib/event-display";
import { TransitionLink } from "./TransitionLink";
import { trackSearch } from "../lib/gtm";
import { trackEvent } from "../lib/analytics";
import { STANDARD_CATEGORIES } from "../../lib/constants";
import FavoriteButton from "./FavoriteButton";
import { AppIcon, CalendarIcon, MapPinIcon } from "./EventIcons";
import EventCategoryIcon from "./EventCategoryIcon";
import { calendarToday } from "../../lib/calendar-view";
import type { PublicListEvent } from "../../lib/public-event-list";

type EventListMode = "full" | "quick";
type QuickDateFilter = "today" | "tomorrow" | "weekend" | "week";
type FullDateFilter = "upcoming" | QuickDateFilter | "custom";

// Funzione per pulire il testo da caratteri strani
function cleanText(text: string): string {
  if (!text) return "";
  return (
    text
      // Rimuove caratteri di controllo e non stampabili
      .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
      // Sostituisce caratteri di encoding problematici
      .replace(/â€™/g, "'")
      .replace(/â€œ/g, '"')
      .replace(/â€/g, '"')
      .replace(/â€"/g, "—")
      .replace(/Ã /g, "à")
      .replace(/Ã¨/g, "è")
      .replace(/Ã©/g, "é")
      .replace(/Ã¬/g, "ì")
      .replace(/Ã²/g, "ò")
      .replace(/Ã¹/g, "ù")
      .replace(/\s+/g, " ")
      .trim()
  );
}

type Event = PublicListEvent;
type PriceLabel = "gratis" | "pagamento" | "non definito";

function getPriceLabel(rawPrice: string | null | undefined): PriceLabel {
  if (!rawPrice) return "non definito";
  const price = rawPrice.toLowerCase();
  if (price.includes("gratis") || price.includes("ingresso libero") || price.includes("ingresso gratuito") || price.includes("free")) return "gratis";
  if (price.includes("non definito")) return "non definito";
  if (/\d/.test(price) || price.includes("€") || price.includes("euro") || price.includes("bigliett") || price.includes("prevendita") || price.includes("ticket") || price.includes("vivaticket") || price.includes("ticketone")) return "pagamento";
  return "non definito";
}

function getPriceBadgeClasses(label: PriceLabel): string {
  switch (label) {
    case "gratis": return "bg-black text-white";
    case "pagamento": return "bg-black/80 text-white";
    default: return "bg-black/50 text-white";
  }
}

function getCategoryBadgeClasses(rawCategory: string): string {
  const cat = rawCategory.toLowerCase();
  switch (cat) {
    case "musica": case "music": case "nightlife": case "cultura": case "culture":
    case "cibo": case "food": case "sport": case "famiglia": case "family":
    case "teatro": case "theater": case "festa": case "party": case "passeggiata": case "walk":
      return "bg-black";
    default:
      return "bg-black";
  }
}

function parseEventDate(value: string): Date | null {
  if (!value) return null;
  if (value.includes("/")) {
    const [day, month, year] = value.split("/").map(part => parseInt(part, 10));
    if (!day || !month || !year) return null;
    const parsed = new Date(year, month - 1, day);
    parsed.setHours(0, 0, 0, 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function getQuickRange(filter: QuickDateFilter, dateAnchor = calendarToday()): { start: Date; end: Date } {
  const today = new Date(`${dateAnchor}T00:00:00`);
  today.setHours(0, 0, 0, 0);

  if (filter === "today") {
    return { start: today, end: today };
  }

  if (filter === "tomorrow") {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { start: tomorrow, end: tomorrow };
  }

  if (filter === "week") {
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return { start: today, end: weekEnd };
  }

  const day = today.getDay();
  let start = new Date(today);

  if (day === 6) {
    start = today;
  } else if (day === 0) {
    start = today;
  } else {
    start.setDate(today.getDate() + (6 - day));
  }

  const end = new Date(start);
  if (start.getDay() === 6) {
    end.setDate(start.getDate() + 1);
  }

  return { start, end };
}

function isDateInRange(date: Date, start: Date, end: Date): boolean {
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function formatApiDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function EventList({ mode = "full", initialEvents, initialToday }: { mode?: EventListMode; initialEvents?: Event[]; initialToday?: string }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const hasLoadedEventsRef = useRef(initialEvents !== undefined);
  const [events, setEvents] = useState<Event[]>(initialEvents ?? []);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>(() => {
    const { start, end } = getQuickRange("today", initialToday);
    return (initialEvents ?? []).filter(event => {
      const date = parseEventDate(event.date);
      return date && (mode === "quick" ? isDateInRange(date, start, end) : date >= start);
    }).sort((first, second) =>
      (parseEventDate(first.date)?.getTime() ?? 0) - (parseEventDate(second.date)?.getTime() ?? 0) || first.id - second.id,
    );
  });
  const [loading, setLoading] = useState(initialEvents === undefined);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [fullDateFilter, setFullDateFilter] = useState<FullDateFilter>("upcoming");
  const [organizerFilter, setOrganizerFilter] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const [quickDateFilter, setQuickDateFilter] =
    useState<QuickDateFilter>("today");
  const [visibleCount, setVisibleCount] = useState(12);
  useEffect(() => {
    const grid = gridRef.current;
    if (loading || !grid || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const context = gsap.context(() => {
      const cards = Array.from(grid.querySelectorAll(".event-card")).slice(0, 12);
      if (cards.length === 0) return;
      gsap.fromTo(
        cards,
        { y: 18 },
        { y: 0, duration: 0.48, stagger: 0.035, ease: "power2.out", clearProps: "all" },
      );
    }, grid);
    return () => context.revert();
  }, [filteredEvents, visibleCount, loading]);

  const fetchEvents = useCallback(async () => {
    if (!hasLoadedEventsRef.current) setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (mode === "quick") {
        const { start, end } = getQuickRange(quickDateFilter);
        params.set("dateFrom", formatApiDate(start));
        params.set("dateTo", formatApiDate(end));
      }

      const response = await fetch(`/api/events?${params.toString()}`);
      if (!response.ok) throw new Error(`Event request failed: ${response.status}`);
      const data = await response.json();
      setEvents(Array.isArray(data) ? data : []);
      hasLoadedEventsRef.current = true;
    } catch (error) {
      console.error("Error fetching events:", error);
      setLoadError(!hasLoadedEventsRef.current);
    } finally {
      setLoading(false);
    }
  }, [mode, quickDateFilter]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    // Carica i preferiti iniziali per l'utente loggato (se presente)
    const fetchFavorites = async () => {
      try {
        const res = await fetch("/api/favorites", { cache: "no-store" });
        if (!res.ok) return;
        const data: { id: number }[] = await res.json();
        setFavoriteIds(new Set(data.map((e) => e.id)));
      } catch {
        // Ignora errori: per utenti non loggati / problemi di rete
      }
    };

    fetchFavorites();

    // Controlla il parametro refresh solo al mount
    const refresh = new URLSearchParams(window.location.search).get("refresh");
    if (refresh) {
      window.history.replaceState({}, "", "/");
    }
  }, []);

  useEffect(() => {
    if (mode === "quick") {
      setVisibleCount(12);
    }
  }, [quickDateFilter, mode]);

  function filterEvents() {
    if (mode === "quick") {
      const { start, end } = getQuickRange(quickDateFilter);
      const quickFiltered = events
        .filter((event) => {
          const parsedDate = parseEventDate(event.date);
          if (!parsedDate) return false;
          return isDateInRange(parsedDate, start, end);
        })
        .sort((a, b) => {
          const firstDate = parseEventDate(a.date)?.getTime() || 0;
          const secondDate = parseEventDate(b.date)?.getTime() || 0;
          if (firstDate === secondDate) {
            return a.id - b.id;
          }
          return firstDate - secondDate;
        });

      setFilteredEvents(quickFiltered);
      return;
    }

    let filtered = events;

    // In full mode show only events from today onward.
    const { start: today } = getQuickRange("today");
    filtered = filtered.filter((event) => {
      const parsedDate = parseEventDate(event.date);
      if (!parsedDate) return false;
      return parsedDate.getTime() >= today.getTime();
    });

    if (search) {
      filtered = filtered.filter(
        (event) =>
          event.title.toLowerCase().includes(search.toLowerCase()) ||
          event.description.toLowerCase().includes(search.toLowerCase()) ||
          (event.location || "").toLowerCase().includes(search.toLowerCase()),
      );

      // Track search
      trackSearch(search, category, filtered.length);
      trackEvent("search", "Events", search, filtered.length);
    }

    if (category) {
      filtered = filtered.filter((event) => event.category === category);
    }

    if (fullDateFilter !== "upcoming" && fullDateFilter !== "custom") {
      const range = getQuickRange(fullDateFilter);
      filtered = filtered.filter(event => {
        const date = parseEventDate(event.date);
        return date ? isDateInRange(date, range.start, range.end) : false;
      });
    }
    if (dateFrom) {
      filtered = filtered.filter((event) => event.date >= dateFrom);
    }
    if (dateTo) {
      filtered = filtered.filter((event) => event.date <= dateTo);
    }

    if (organizerFilter) {
      const needle = organizerFilter.toLowerCase();
      filtered = filtered.filter((event) =>
        (event.organizer || "").toLowerCase().includes(needle),
      );
    }

    filtered = [...filtered].sort((a, b) => {
      const firstDate = parseEventDate(a.date)?.getTime() ?? 0;
      const secondDate = parseEventDate(b.date)?.getTime() ?? 0;
      if (firstDate === secondDate) {
        return a.id - b.id;
      }
      return firstDate - secondDate;
    });

    setFilteredEvents(filtered);
  }

  useEffect(() => {
    filterEvents();
  }, [
    events,
    search,
    category,
    dateFrom,
    dateTo,
    fullDateFilter,
    organizerFilter,
    quickDateFilter,
    mode,
  ]);

  const [filtersOpen, setFiltersOpen] = useState(false);

  const handleFavoriteToggleLocal = (eventId: number, newValue: boolean) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (newValue) {
        next.add(eventId);
      } else {
        next.delete(eventId);
      }
      return next;
    });
  };

  if (loading) {
    return <div className="text-center py-8">Caricamento eventi...</div>;
  }

  if (loadError) {
    return (
      <div role="alert" className="border border-black/20 bg-white p-8">
        <p className="text-black font-semibold">Non riusciamo a caricare gli eventi in questo momento.</p>
        <button type="button" onClick={fetchEvents} className="industrial-link industrial-link-outline">
          Riprova <span aria-hidden="true">↗</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {mode === "quick" ? (
        <div className="quick-filters">
          <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Filtra per periodo">
            {[
              { value: "today" as const, label: "oggi" },
              { value: "tomorrow" as const, label: "domani" },
              { value: "weekend" as const, label: "weekend" },
              { value: "week" as const, label: "questa settimana" },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setQuickDateFilter(option.value)}
                aria-pressed={quickDateFilter === option.value}
                className={`quick-filter whitespace-nowrap px-4 py-2 text-[11px] uppercase tracking-[0.12em] font-bold border transition-colors ${
                  quickDateFilter === option.value
                    ? "quick-filter-active"
                    : ""
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3 border border-black/10 bg-white p-3 md:p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(190px,0.8fr)]">
            <label className="flex min-w-0 items-center gap-2 border border-black/20 px-3 focus-within:border-black">
              <AppIcon name="search" className="h-5 w-5 shrink-0 text-[var(--accent)]" />
              <input
                type="search"
                placeholder="Cerca eventi per titolo, descrizione o luogo"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Cerca eventi"
                className="min-w-0 w-full py-2.5 text-sm text-black placeholder-black/40 focus:outline-none"
              />
            </label>
            <label className="sr-only" htmlFor="event-category-filter">Categoria</label>
            <label className="flex min-w-0 items-center gap-2 border border-black/20 bg-white px-3 focus-within:border-black">
              <EventCategoryIcon category={category} className="h-4 w-4 shrink-0 text-black/60" />
              <select
                id="event-category-filter"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                aria-label="Categoria"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-black focus:outline-none"
              >
                <option value="">Tutte le categorie</option>
                {STANDARD_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-col gap-3 border-t border-black/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap gap-2" role="group" aria-label="Periodo eventi">
              {([
                { value: "upcoming", label: "Prossimi" },
                { value: "today", label: "Oggi" },
                { value: "tomorrow", label: "Domani" },
                { value: "weekend", label: "Weekend" },
                { value: "week", label: "7 giorni" },
              ] as const).map(option => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={fullDateFilter === option.value}
                  onClick={() => {
                    setFullDateFilter(option.value);
                    setDateFrom("");
                    setDateTo("");
                  }}
                  className={`border px-3 py-2 text-xs font-bold transition-colors ${fullDateFilter === option.value ? "border-black bg-black text-white" : "border-black/20 bg-white text-black hover:border-black"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFiltersOpen(open => !open)}
                aria-expanded={filtersOpen}
                aria-controls="advanced-event-filters"
                className="whitespace-nowrap text-sm font-semibold text-black underline underline-offset-4"
              >
                {filtersOpen ? "Nascondi filtri" : "Altri filtri"}
              </button>
              {(search || category || organizerFilter || dateFrom || dateTo || fullDateFilter !== "upcoming") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setCategory("");
                    setOrganizerFilter("");
                    setDateFrom("");
                    setDateTo("");
                    setFullDateFilter("upcoming");
                  }}
                  className="whitespace-nowrap text-sm font-semibold text-red-700 underline underline-offset-4"
                >
                  Azzera filtri
                </button>
              )}
            </div>
          </div>

          {filtersOpen && (
            <div id="advanced-event-filters" className="grid grid-cols-1 gap-3 border-t border-black/10 pt-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-1 text-xs font-semibold text-black/70">
                Dal
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => { setDateFrom(event.target.value); setFullDateFilter("custom"); }}
                  min={new Date().toISOString().slice(0, 10)}
                  aria-label="Data di inizio"
                  className="w-full border border-black/20 bg-white px-3 py-2.5 text-sm text-black focus:border-black focus:outline-none"
                />
              </label>
              <label className="space-y-1 text-xs font-semibold text-black/70">
                Al
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => { setDateTo(event.target.value); setFullDateFilter("custom"); }}
                  min={dateFrom || new Date().toISOString().slice(0, 10)}
                  aria-label="Data di fine"
                  className="w-full border border-black/20 bg-white px-3 py-2.5 text-sm text-black focus:border-black focus:outline-none"
                />
              </label>
              <label className="space-y-1 text-xs font-semibold text-black/70">
                Organizzatore
                <input
                  type="search"
                  placeholder="Nome organizzatore"
                  value={organizerFilter}
                  onChange={(event) => setOrganizerFilter(event.target.value)}
                  aria-label="Organizzatore"
                  className="w-full border border-black/20 bg-white px-3 py-2.5 text-sm text-black placeholder-black/40 focus:border-black focus:outline-none"
                />
              </label>
            </div>
          )}
        </div>
      )}

      {(() => {
        const displayedEvents =
          mode === "quick"
            ? filteredEvents.slice(0, visibleCount)
            : filteredEvents;
        const gridClasses = "event-list-grid grid gap-4 md:gap-5";

        return (
          <>
            <div ref={gridRef} className={gridClasses}>
              {filteredEvents.length === 0 ? (
                <div className="col-span-full text-center py-16">
                  <h3 className="text-2xl font-bold text-black mb-2">
                    Nessun evento trovato
                  </h3>
                  <p className="text-black/55">
                    Prova a cambiare i filtri di ricerca
                  </p>
                </div>
              ) : (
                displayedEvents.map((event) => (
                  <TransitionLink
                    key={event.id}
                    href={`/events/${generateUniqueSlug(event.title, event.id)}`}
                    className="event-card group flex items-stretch no-underline hover:no-underline bg-white transition-colors"
                  >
                    <div className="event-card-body flex flex-1 min-w-0 flex-col gap-3 p-4 md:p-5">
                      <div className="space-y-2">
                        <h3 className="text-lg md:text-xl font-black text-black leading-tight line-clamp-2 transition-colors">
                          {cleanText(event.title)}
                        </h3>
                        <p className="event-card-description text-black/60 text-sm line-clamp-2">
                          {cleanText(event.description)}
                        </p>
                      </div>

                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2 text-black/80">
                          <CalendarIcon className="event-card-meta-icon h-4 w-4 shrink-0 text-[#d65a38]" />
                          <span>
                            {(() => {
                              const dateObj = parseEventDate(event.date);
                              if (!dateObj) return event.date;
                              return dateObj.toLocaleDateString("it-IT", {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                              });
                            })()}
                          </span>
                          {getEventStartTime(event.time) && (
                            <span className="text-black/40">
                              • {getEventStartTime(event.time)}
                            </span>
                          )}
                        </div>

                        {event.location && (
                          <div className="flex items-center gap-2 text-black/80 min-w-0">
                            <MapPinIcon className="event-card-meta-icon h-4 w-4 shrink-0 text-[#d65a38]" />
                            <span className="truncate">{event.location}</span>
                          </div>
                        )}

                        {event.organizer && (
                          <div className="event-card-organizer flex items-center gap-2 text-black/80 min-w-0">
                            <span className="w-4 shrink-0">•</span>
                            <span className="truncate">{event.organizer}</span>
                          </div>
                        )}
                      </div>

                    </div>

                    <div className="event-card-media relative overflow-hidden shrink-0">
                      <FavoriteButton
                        eventId={event.id}
                        initialIsFavorite={favoriteIds.has(event.id)}
                        onToggle={(newValue) =>
                          handleFavoriteToggleLocal(event.id, newValue)
                        }
                      />
                      {event.imageUrl ? (
                        <Image
                          src={event.imageUrl}
                          alt={event.title}
                          width={400}
                          height={400}
                          className="event-card-image absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                          sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, 50vw"
                        />
                      ) : (
                        <div className="event-card-placeholder absolute inset-0 flex items-center justify-center">
                          <div className="text-xs uppercase tracking-[0.12em] text-black/40 font-bold">
                            No image
                          </div>
                        </div>
                      )}

                      <div className="absolute bottom-2 inset-x-2 z-10 flex items-end justify-between gap-1 sm:gap-2">
                        {event.category && (
                          <span
                            className={`inline-flex min-w-0 items-center gap-1 break-words px-1.5 sm:px-2.5 py-1 text-[9px] sm:text-[10px] uppercase font-bold text-white ${getCategoryBadgeClasses(event.category)}`}
                          >
                            <EventCategoryIcon category={event.category} className="h-3 w-3 shrink-0" />
                            {event.category}
                          </span>
                        )}
                        {(() => {
                          const label = getPriceLabel(event.price);
                          return (
                            <div
                              className={`ml-auto shrink-0 px-1.5 sm:px-2 py-1 text-[9px] sm:text-[10px] uppercase sm:tracking-[0.11em] font-bold ${getPriceBadgeClasses(label)}`}
                            >
                              {label}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </TransitionLink>
                ))
              )}
            </div>

            {mode === "quick" && filteredEvents.length > visibleCount && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={() => setVisibleCount((prev) => prev + 12)}
                  className="inline-flex items-center h-10 px-5 border border-black text-black text-xs uppercase tracking-[0.12em] font-bold hover:bg-black hover:text-white transition-colors"
                >
                  Mostra altri
                </button>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}
