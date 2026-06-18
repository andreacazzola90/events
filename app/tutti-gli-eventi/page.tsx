"use client";

import { useEffect, useMemo, useState } from "react";
import { TransitionLink } from "../components/TransitionLink";
import { generateUniqueSlug } from "../../lib/slug-utils";
import type { DbEvent } from "../types/event";

export default function TuttiGliEventiPage() {
  const [events, setEvents] = useState<DbEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await fetch("/api/events?limit=500", { cache: "no-store" });
        if (!res.ok) {
          setEvents([]);
          return;
        }
        const data = await res.json();
        setEvents(Array.isArray(data) ? data : []);
      } catch {
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

  const parseEventDate = (value: string): Date | null => {
    if (!value) return null;

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
      const [day, month, year] = value
        .split("/")
        .map((part) => parseInt(part, 10));
      const parsed = new Date(year, month - 1, day);
      parsed.setHours(0, 0, 0, 0);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  };

  const toDateKey = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const eventsByDate = useMemo(() => {
    const map = new Map<string, DbEvent[]>();
    for (const event of events) {
      const parsed = parseEventDate(event.date);
      if (!parsed) continue;
      const key = toDateKey(parsed);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(event);
    }

    for (const list of map.values()) {
      list.sort((a, b) => (a.time || "").localeCompare(b.time || "", "it-IT"));
    }

    return map;
  }, [events]);

  const monthLabel = new Intl.DateTimeFormat("it-IT", {
    month: "long",
    year: "numeric",
  }).format(monthDate);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const lastDay = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
      0,
    );
    const startOffset = (firstDay.getDay() + 6) % 7; // lunedi=0
    const totalDays = lastDay.getDate();
    const cells: Array<{ date: Date | null; key: string }> = [];

    for (let i = 0; i < startOffset; i += 1) {
      cells.push({ date: null, key: `empty-${i}` });
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
      cells.push({ date, key: toDateKey(date) });
    }

    return cells;
  }, [monthDate]);

  return (
    <main className="min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Calendario Eventi
          </h1>
          <p className="text-xl text-gray-400">
            Vista mensile con eventi organizzati per data.
          </p>
        </div>

        <div className="animate-fadeInUp">
          <section className="border border-black/10 bg-white p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() =>
                  setMonthDate(
                    (prev) =>
                      new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
                  )
                }
                className="px-3 py-2 border border-black/20 text-sm hover:bg-black hover:text-white transition-colors"
              >
                Mese precedente
              </button>
              <h2 className="text-xl md:text-2xl font-bold capitalize">
                {monthLabel}
              </h2>
              <button
                type="button"
                onClick={() =>
                  setMonthDate(
                    (prev) =>
                      new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                  )
                }
                className="px-3 py-2 border border-black/20 text-sm hover:bg-black hover:text-white transition-colors"
              >
                Mese successivo
              </button>
            </div>

            <div className="grid grid-cols-7 text-xs md:text-sm font-bold uppercase tracking-wide text-black/60 mb-2">
              {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d) => (
                <div key={d} className="p-2">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((cell) => {
                if (!cell.date) {
                  return (
                    <div
                      key={cell.key}
                      className="min-h-28 border border-transparent"
                    />
                  );
                }

                const key = cell.key;
                const dayEvents = eventsByDate.get(key) || [];
                const hasEvents = dayEvents.length > 0;

                return (
                  <div
                    key={key}
                    className={`min-h-28 p-1.5 border text-left flex flex-col ${
                      hasEvents
                        ? "border-black/20 bg-white"
                        : "border-black/8 bg-white/60"
                    }`}
                  >
                    <div
                      className={`text-sm font-bold mb-1 ${
                        hasEvents ? "text-black" : "text-black/40"
                      }`}
                    >
                      {cell.date.getDate()}
                    </div>
                    {loading && hasEvents && (
                      <div className="text-[10px] text-black/40">...</div>
                    )}
                    <div className="flex flex-col gap-0.5 overflow-hidden">
                      {dayEvents.slice(0, 3).map((event) => (
                        <TransitionLink
                          key={event.id}
                          href={`/events/${generateUniqueSlug(event.title, event.id)}`}
                          className="block text-[10px] leading-tight px-1 py-0.5 bg-black text-white truncate hover:bg-black/70 transition-colors no-underline"
                          title={event.title}
                        >
                          {event.time ? `${event.time} ` : ""}
                          {event.title}
                        </TransitionLink>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-black/50 px-1">
                          +{dayEvents.length - 3} altri
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
