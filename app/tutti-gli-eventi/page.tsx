"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, ImageOff, X } from "lucide-react";
import { TransitionLink } from "../components/TransitionLink";
import { generateUniqueSlug } from "../../lib/slug-utils";
import { parseEventDate, parseEventTime } from "../../lib/calendar-ics";
import { calendarDateLabel, calendarDays, calendarPeriodLabel, calendarToday, moveCalendarDate, type CalendarView } from "../../lib/calendar-view";
import type { DbEvent } from "../types/event";

const views: { value: CalendarView; label: string }[] = [
  { value: "month", label: "Mese" },
  { value: "week", label: "Settimana" },
  { value: "threeDays", label: "3 giorni" },
  { value: "day", label: "Giorno" },
];

function CalendarEventLink({ event, compact = false }: { event: DbEvent; compact?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <TransitionLink href={`/events/${generateUniqueSlug(event.title, event.id)}`}
      className={`calendar-event-link ${compact ? "is-compact" : ""}`} title={event.title}
      aria-label={`${event.time || "Tutto il giorno"}, ${event.title}`}>
      <span className="calendar-thumbnail" aria-hidden="true">
        {event.imageUrl && !imageFailed ? (
          <Image src={event.imageUrl} alt="" width={compact ? 28 : 56} height={compact ? 28 : 56}
            unoptimized className="calendar-thumbnail-image" onError={() => setImageFailed(true)} />
        ) : <ImageOff size={compact ? 14 : 20} />}
      </span>
      <span className="calendar-event-copy">
        <span className="calendar-event-time">{event.time || "Tutto il giorno"}</span>
        <span className="calendar-event-title">{event.title}</span>
        {!compact && event.location && <span className="calendar-event-location">{event.location}</span>}
      </span>
    </TransitionLink>
  );
}

function DayPreview({ date, events, onClose, onOpenDay }: {
  date: string; events: DbEvent[]; onClose: () => void; onOpenDay: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog ref={dialogRef} className="calendar-preview" aria-labelledby="calendar-preview-title"
      onCancel={onClose}
      onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}>
      <div className="calendar-preview-header">
        <div>
          <h2 id="calendar-preview-title">{calendarDateLabel(date)}</h2>
          <p>{events.length} {events.length === 1 ? "evento" : "eventi"}</p>
        </div>
        <button type="button" className="calendar-icon-button" aria-label="Chiudi anteprima" title="Chiudi anteprima" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <ul className="calendar-event-list calendar-preview-list">
        {events.map(event => <li key={event.id}><CalendarEventLink event={event} /></li>)}
      </ul>
      <button type="button" className="calendar-open-day" onClick={onOpenDay}>
        Apri giorno <ArrowRight size={18} aria-hidden="true" />
      </button>
    </dialog>
  );
}

export default function TuttiGliEventiPage() {
  const [events, setEvents] = useState<DbEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [anchorDate, setAnchorDate] = useState(calendarToday);
  const [view, setView] = useState<CalendarView>("month");
  const [previewDate, setPreviewDate] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusDayRef = useRef(false);

  useEffect(() => {
    if (view === "day" && focusDayRef.current) {
      headingRef.current?.focus({ preventScroll: true });
      focusDayRef.current = false;
    }
  }, [view, anchorDate]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(false);
    const fetchEvents = async () => {
      try {
        const response = await fetch("/api/events?limit=500&includePast=true", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Calendar load failed");
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error("Invalid calendar response");
        setEvents(data);
      } catch {
        if (!controller.signal.aborted) { setEvents([]); setLoadError(true); }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void fetchEvents();
    return () => controller.abort();
  }, [reload]);

  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, DbEvent[]>();
    for (const event of events) {
      const date = parseEventDate(event.date);
      if (!date) continue;
      const key = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
      const list = grouped.get(key) || [];
      list.push(event);
      grouped.set(key, list);
    }
    const minutes = (event: DbEvent) => {
      const time = parseEventTime(event.time);
      return time ? time.hour * 60 + time.minute : 24 * 60;
    };
    for (const list of grouped.values()) list.sort((first, second) => minutes(first) - minutes(second) || first.title.localeCompare(second.title, "it"));
    return grouped;
  }, [events]);

  const today = calendarToday();
  const days = calendarDays(anchorDate, view);
  const openDay = (date: string) => {
    focusDayRef.current = true;
    setAnchorDate(date);
    setView("day");
    setPreviewDate(null);
    if (view === "day" && anchorDate === date) headingRef.current?.focus({ preventScroll: true });
  };

  return (
    <main className="min-h-screen page-shell event-calendar-page">
      <div className="editorial-container">
        <div className="mb-12 page-heading">
          <p className="section-kicker">02 / Le date</p>
          <h1 className="text-5xl md:text-7xl font-black mb-4 uppercase">
            Calendario<span className="site-brand-accent">.</span>
          </h1>
        </div>
        <section className="event-calendar" aria-label="Calendario eventi">
          <div className="calendar-toolbar">
            <div className="calendar-navigation">
              <button type="button" className="calendar-icon-button" aria-label="Periodo precedente" title="Periodo precedente"
                onClick={() => setAnchorDate(previous => moveCalendarDate(previous, view, -1))}>
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <button type="button" className="calendar-icon-button" aria-label="Periodo successivo" title="Periodo successivo"
                onClick={() => setAnchorDate(previous => moveCalendarDate(previous, view, 1))}>
                <ChevronRight size={20} aria-hidden="true" />
              </button>
              <button type="button" className="calendar-today-button" onClick={() => setAnchorDate(calendarToday())}>
                <CalendarDays size={16} aria-hidden="true" /> Oggi
              </button>
            </div>
            <div className="calendar-view-switch" role="group" aria-label="Visualizzazione calendario">
              {views.map(mode => <button key={mode.value} type="button" aria-pressed={view === mode.value}
                onClick={() => setView(mode.value)}>{mode.label}</button>)}
            </div>
          </div>
          <h2 ref={headingRef} tabIndex={-1} className="calendar-period-title" aria-live="polite">{calendarPeriodLabel(anchorDate, view)}</h2>
          {loading && <p className="calendar-status" role="status">Caricamento eventi...</p>}
          {loadError && <div className="calendar-status" role="alert">Impossibile caricare gli eventi. <button type="button" onClick={() => setReload(previous => previous + 1)}>Riprova</button></div>}
          <div className="calendar-scroll" tabIndex={0} aria-label="Eventi del periodo">
            {view === "month" ? (
              <div className="calendar-month-grid" role="table" aria-label={`Calendario eventi ${calendarPeriodLabel(anchorDate, view)}`}>
                <div className="calendar-weekdays" role="row">
                  {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map(day => <div key={day} role="columnheader">{day}</div>)}
                </div>
                <div className="calendar-days">
                  {Array.from({ length: days.length / 7 }, (_, row) => (
                    <div key={row} role="row" className="calendar-month-row">
                      {days.slice(row * 7, row * 7 + 7).map((date, index) => {
                        if (!date) return <div key={`empty-${index}`} role="cell" className="calendar-empty-day" aria-label="Fuori mese" />;
                        const dayEvents = eventsByDate.get(date) || [];
                        const isPast = date < today;
                        const isOutsideMonth = date.slice(0, 7) !== anchorDate.slice(0, 7);
                        return (
                          <div key={date} role="cell" data-date={date}
                            aria-label={`${calendarDateLabel(date)}, ${dayEvents.length} eventi`}
                            className={`calendar-day ${dayEvents.length && !isPast ? "has-events" : ""} ${date === today ? "is-today" : ""} ${isPast ? "is-past" : ""} ${isOutsideMonth ? "is-outside-month" : ""}`}
                            onClick={event => { if (!isPast && !(event.target as Element).closest("a,button")) openDay(date); }}>
                            <button type="button" className="calendar-day-number" aria-label={`Apri ${calendarDateLabel(date)}`} onClick={() => openDay(date)} disabled={isPast}>
                              <span className="calendar-day-desktop-number">{Number(date.slice(-2))}</span>
                              <time className="calendar-day-mobile-date" dateTime={date}>{calendarDateLabel(date, { weekday: "short", day: "numeric", month: "short" })}</time>
                            </button>
                            <ul className="calendar-event-list">
                              {!isPast && dayEvents.slice(0, 3).map(event => <li key={event.id}><CalendarEventLink event={event} compact /></li>)}
                            </ul>
                            {!isPast && dayEvents.length > 3 && <button type="button" className="calendar-more-events"
                              aria-haspopup="dialog" aria-label={`+${dayEvents.length - 3} ${dayEvents.length - 3 === 1 ? "evento" : "eventi"}`}
                              onClick={() => setPreviewDate(date)}>
                              +{dayEvents.length - 3}<span className="calendar-more-label"> {dayEvents.length - 3 === 1 ? "evento" : "eventi"}</span>
                            </button>}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className={`calendar-period-days is-${view}`}>
                {days.map(date => {
                  if (!date) return null;
                  const dayEvents = eventsByDate.get(date) || [];
                  return <section key={date} data-date={date} className={`calendar-period-day ${date === today ? "is-today" : ""}`}>
                    <button type="button" className="calendar-day-heading" onClick={() => openDay(date)} aria-label={`Apri ${calendarDateLabel(date)}`}>
                      <time dateTime={date}>{calendarDateLabel(date, { weekday: "short", day: "numeric", month: "short" })}</time>
                      <span>{dayEvents.length} {dayEvents.length === 1 ? "evento" : "eventi"}</span>
                    </button>
                    <ul className="calendar-event-list">
                      {dayEvents.map(event => <li key={event.id}><CalendarEventLink event={event} compact={view === "week"} /></li>)}
                    </ul>
                    {!loading && !loadError && !dayEvents.length && <p className="calendar-empty-message">Nessun evento</p>}
                  </section>;
                })}
              </div>
            )}
          </div>
          {previewDate && <DayPreview date={previewDate} events={eventsByDate.get(previewDate) || []}
            onClose={() => setPreviewDate(null)} onOpenDay={() => openDay(previewDate)} />}
        </section>
      </div>
    </main>
  );
}
