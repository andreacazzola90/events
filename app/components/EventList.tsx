"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { generateUniqueSlug } from "../../lib/slug-utils";
import { trackSearch } from "../lib/gtm";
import { trackEvent } from "../lib/analytics";
import { STANDARD_CATEGORIES } from "../../lib/constants";
import { AppIcon } from "./EventIcons";
import EventCategoryIcon from "./EventCategoryIcon";
import EventPreview from "./EventPreview";
import { useSiteSettings } from "./SiteSettingsProvider";
import { calendarToday } from "../../lib/calendar-view";
import type { PublicListEvent } from "../../lib/public-event-list";
import LoadingAnimation from "./LoadingAnimation";

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

function getDisplayValue(rawValue: string | null | undefined): string | null {
  const value = cleanText(rawValue ?? "");
  if (!value || /^(undefined|null|non definito|non specificato|non trovato|not defined|not specified|not found)$/i.test(value)) return null;
  return value;
}

function getCategoryLabel(rawCategory: string | null | undefined): string | null {
  return getDisplayValue(rawCategory);
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
  const { settings } = useSiteSettings();
  const hasLoadedEventsRef = useRef(initialEvents !== undefined);
  const canUseInitialSeedRef = useRef(initialEvents !== undefined);
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

  const fetchEvents = useCallback(async () => {
    setLoading(true);
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
    if (
      canUseInitialSeedRef.current &&
      initialToday === calendarToday() &&
      (mode !== "quick" || quickDateFilter === "today") &&
      !new URLSearchParams(window.location.search).has("refresh")
    ) return;

    canUseInitialSeedRef.current = false;
    void fetchEvents();
  }, [fetchEvents, initialToday, mode, quickDateFilter]);

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
          <div className="quick-filters-scroll flex gap-2 overflow-x-auto" role="group" aria-label="Filtra per periodo">
            {[
              { value: "today" as const, label: "oggi" },
              { value: "tomorrow" as const, label: "domani" },
              { value: "weekend" as const, label: "weekend" },
              { value: "week" as const, label: "questa settimana" },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setQuickDateFilter(option.value)}
                onFocus={(event) => {
                  if (event.currentTarget.matches(":focus-visible")) {
                    event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
                  }
                }}
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
        <div className="space-y-4 bg-transparent py-2 md:py-4">
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
        const gridClasses = "event-list-grid grid";

        return (
          <>
            <div className={gridClasses}>
              {loading ? (
                <LoadingAnimation message="Caricamento eventi..." className="col-span-full py-16 text-center" />
              ) : filteredEvents.length === 0 ? (
                <div className="col-span-full text-center py-16">
                  <h3 className="text-2xl font-bold text-black mb-2">
                    Nessun evento trovato
                  </h3>
                  <p className="text-black/55">
                    Prova a cambiare i filtri di ricerca
                  </p>
                </div>
              ) : (
                displayedEvents.map((event, index) => {
                  const category = getCategoryLabel(event.category);
                  const location = getDisplayValue(event.location);
                  const organizer = getDisplayValue(event.organizer);
                  return (
                  <EventPreview
                    key={event.id}
                    eventId={event.id}
                    href={`/events/${generateUniqueSlug(event.title, event.id)}`}
                    title={cleanText(event.title)}
                    imageUrl={event.imageUrl}
                    imageUrls={event.imageUrls}
                    description={cleanText(event.description)}
                    date={event.date}
                    time={event.time}
                    location={location}
                    organizer={organizer}
                    category={category}
                    price={event.price}
                    initialIsFavorite={favoriteIds.has(event.id)}
                    onFavoriteToggle={(newValue) =>
                      handleFavoriteToggleLocal(event.id, newValue)
                    }
                    imageLoading={index < 2 ? "eager" : "lazy"}
                    imageSizes={[
                      "(min-width: 1280px) calc((100vw - clamp(2.5rem, 8vw, 8rem) - 4.5rem) / 4)",
                      "(min-width: 1024px) calc((92vw - 3rem) / 3)",
                      "(min-width: 640px) calc((92vw - 1.25rem) / 2)",
                      mode === "full"
                        ? "calc((100vw - 1.75rem) / 2)"
                        : "calc((100vw - clamp(2.5rem, 8vw, 8rem) - 0.75rem) / 2)",
                    ].join(", ")}
                  />
                  );
                })
              )}
            </div>

            {mode === "quick" && !loading && filteredEvents.length > visibleCount && (
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
