"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Plus, Save, Trash2 } from "lucide-react";

type EventOption = {
  id: number;
  title: string;
  date: string;
  time: string;
  location: string;
  eventSeriesId: number | null;
};

type EventSeriesRecord = {
  id: number;
  slug: string;
  title: string;
  description: string;
  isPublished: boolean;
  events: EventOption[];
  _count: { events: number };
};

type SeriesForm = {
  title: string;
  slug: string;
  description: string;
  isPublished: boolean;
  eventIds: number[];
};

const emptyForm: SeriesForm = {
  title: "",
  slug: "",
  description: "",
  isPublished: false,
  eventIds: [],
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatDate(value: string) {
  if (value.includes("/")) return value;
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
}

export default function EventSeriesAdminClient() {
  const [series, setSeries] = useState<EventSeriesRecord[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedSeriesId, setSelectedSeriesId] = useState<number | null>(null);
  const [form, setForm] = useState<SeriesForm>(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [eventSearch, setEventSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/event-series", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Impossibile caricare le rassegne");
      setSeries(data.series);
      setEvents(data.events);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Errore di caricamento");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function startNewSeries() {
    setSelectedSeriesId(null);
    setForm(emptyForm);
    setSlugTouched(false);
    setMessage("");
  }

  function editSeries(item: EventSeriesRecord) {
    setSelectedSeriesId(item.id);
    setForm({
      title: item.title,
      slug: item.slug,
      description: item.description,
      isPublished: item.isPublished,
      eventIds: item.events.map((event) => event.id),
    });
    setSlugTouched(true);
    setMessage("");
  }

  async function saveSeries(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/event-series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: selectedSeriesId ?? undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Impossibile salvare la rassegna");
      await loadData();
      setSelectedSeriesId(data.id);
      setForm({
        title: data.title,
        slug: data.slug,
        description: data.description,
        isPublished: data.isPublished,
        eventIds: data.events.map((item: EventOption) => item.id),
      });
      setSlugTouched(true);
      setMessage("Rassegna salvata");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Errore durante il salvataggio");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSeries() {
    if (!selectedSeriesId || !window.confirm("Eliminare questa rassegna? Gli eventi resteranno nel sito.")) return;
    const response = await fetch(`/api/admin/event-series?id=${selectedSeriesId}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Impossibile eliminare la rassegna");
      return;
    }
    startNewSeries();
    setMessage("Rassegna eliminata; gli eventi sono rimasti indipendenti");
    await loadData();
  }

  function toggleEvent(eventId: number) {
    setForm((current) => ({
      ...current,
      eventIds: current.eventIds.includes(eventId)
        ? current.eventIds.filter((id) => id !== eventId)
        : [...current.eventIds, eventId],
    }));
  }

  const filteredEvents = events.filter((event) => {
    const haystack = `${event.title} ${event.location} ${event.date}`.toLocaleLowerCase("it");
    return haystack.includes(eventSearch.trim().toLocaleLowerCase("it"));
  });

  return (
    <main className="min-h-screen bg-[#f5f2ec] px-4 py-6 text-[#1d1d1b] md:px-8 md:py-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-5">
          <div>
            <p className="mb-2 text-xs font-bold uppercase text-[#d65a38]">Contenuti</p>
            <h1 className="text-3xl font-black">Rassegne</h1>
            <p className="mt-2 max-w-2xl text-sm text-black/60">Raggruppa appuntamenti in una pagina pubblica con programma per giorno e orario.</p>
          </div>
          <button type="button" onClick={startNewSeries} className="inline-flex items-center gap-2 bg-[#1d1d1b] px-4 py-3 text-sm font-bold text-white hover:bg-[#d65a38]">
            <Plus className="h-4 w-4" /> Nuova rassegna
          </button>
        </header>

        {message && <p role="status" className="mb-4 border-l-4 border-[#d65a38] bg-white px-4 py-3 text-sm">{message}</p>}

        <div className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside aria-label="Rassegne esistenti">
            <h2 className="mb-3 text-xs font-bold uppercase text-black/55">Esistenti</h2>
            {loading ? <p className="py-4 text-sm text-black/50">Caricamento…</p> : (
              <ul className="divide-y divide-black/10 border-y border-black/10 bg-white">
                {series.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => editSeries(item)} aria-current={selectedSeriesId === item.id ? "page" : undefined} className={`w-full px-4 py-3 text-left transition-colors ${selectedSeriesId === item.id ? "bg-[#f5e7e2]" : "hover:bg-black/[0.03]"}`}>
                      <span className="block font-bold">{item.title}</span>
                      <span className="mt-1 block text-xs text-black/55">{item._count.events} eventi · {item.isPublished ? "Pubblicata" : "Bozza"}</span>
                    </button>
                  </li>
                ))}
                {series.length === 0 && <li className="px-4 py-5 text-sm text-black/50">Nessuna rassegna ancora.</li>}
              </ul>
            )}
          </aside>

          <form onSubmit={saveSeries} className="min-w-0 space-y-7">
            <section className="space-y-4 border-b border-black/10 pb-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-black">{selectedSeriesId ? "Modifica rassegna" : "Nuova rassegna"}</h2>
                {selectedSeriesId && form.isPublished && (
                  <Link href={`/rassegne/${form.slug}`} target="_blank" className="inline-flex items-center gap-1 text-sm font-semibold text-[#a33f24] underline underline-offset-4">
                    Apri pagina <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
              <label className="block space-y-1 text-sm font-semibold">
                Titolo
                <input required maxLength={160} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value, slug: slugTouched ? current.slug : slugify(event.target.value) }))} className="w-full border border-black/20 bg-white px-3 py-2.5 font-normal focus:border-[#d65a38] focus:outline-none" />
              </label>
              <label className="block space-y-1 text-sm font-semibold">
                Indirizzo pagina
                <div className="flex items-center border border-black/20 bg-white px-3 focus-within:border-[#d65a38]">
                  <span className="shrink-0 text-sm text-black/45">/rassegne/</span>
                  <input required maxLength={180} value={form.slug} onChange={(event) => { setSlugTouched(true); setForm((current) => ({ ...current, slug: slugify(event.target.value) })); }} className="min-w-0 flex-1 py-2.5 text-sm font-normal focus:outline-none" />
                </div>
              </label>
              <label className="block space-y-1 text-sm font-semibold">
                Descrizione
                <textarea rows={4} maxLength={12000} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="w-full resize-y border border-black/20 bg-white px-3 py-2.5 font-normal focus:border-[#d65a38] focus:outline-none" />
              </label>
              <label className="flex items-center gap-3 text-sm font-semibold">
                <input type="checkbox" checked={form.isPublished} onChange={(event) => setForm((current) => ({ ...current, isPublished: event.target.checked }))} className="h-4 w-4 accent-[#d65a38]" />
                Pubblica pagina
              </label>
            </section>

            <section>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">Programma</h2>
                  <p className="mt-1 text-sm text-black/55">Seleziona gli eventi da mostrare nella rassegna. Saranno ordinati per data e ora.</p>
                </div>
                <span className="text-sm font-bold">{form.eventIds.length} selezionati</span>
              </div>
              <input type="search" value={eventSearch} onChange={(event) => setEventSearch(event.target.value)} placeholder="Cerca eventi, luogo o data" aria-label="Cerca eventi da aggiungere" className="mb-3 w-full border border-black/20 bg-white px-3 py-2.5 text-sm focus:border-[#d65a38] focus:outline-none" />
              <div className="max-h-[430px] divide-y divide-black/10 overflow-y-auto border-y border-black/10 bg-white">
                {filteredEvents.map((item) => {
                  const checked = form.eventIds.includes(item.id);
                  const assignedElsewhere = item.eventSeriesId !== null && item.eventSeriesId !== selectedSeriesId;
                  return (
                    <label key={item.id} className="flex cursor-pointer items-start gap-3 px-3 py-3 hover:bg-black/[0.03] sm:px-4">
                      <input type="checkbox" checked={checked} onChange={() => toggleEvent(item.id)} className="mt-1 h-4 w-4 shrink-0 accent-[#d65a38]" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{item.title}</span>
                        <span className="mt-1 block truncate text-xs text-black/55">{formatDate(item.date)}{item.time ? ` · ${item.time}` : ""}{item.location ? ` · ${item.location}` : ""}</span>
                      </span>
                      {assignedElsewhere && <span className="shrink-0 text-[10px] font-bold uppercase text-black/40">Altra rassegna</span>}
                    </label>
                  );
                })}
                {filteredEvents.length === 0 && <p className="px-4 py-6 text-sm text-black/50">Nessun evento trovato.</p>}
              </div>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-5">
              {selectedSeriesId ? (
                <button type="button" onClick={deleteSeries} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" /> Elimina rassegna
                </button>
              ) : <span />}
              <button type="submit" disabled={saving || loading} className="inline-flex items-center gap-2 bg-[#1d1d1b] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#d65a38] disabled:cursor-not-allowed disabled:opacity-50">
                <Save className="h-4 w-4" /> {saving ? "Salvataggio…" : "Salva rassegna"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}