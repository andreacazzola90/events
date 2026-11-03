"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarRange, Clock3, Globe2, Image, ListFilter, Radio, Settings2, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import SiteSettingsTab from "./SiteSettingsTab";
import InstagramStoryTab from "./InstagramStoryTab";
import MessagingAccountsTab from "./MessagingAccountsTab";
import PageHeading from "../components/PageHeading";

// ─── Types ────────────────────────────────────────────────────────────────────

type CronRun = {
  id: number;
  jobKey: string;
  status: "running" | "completed" | "failed" | "stopped" | string;
  startedAt: string;
  finishedAt: string | null;
  resultJson: string | null;
};

type ParsedResult = {
  found?: number;
  alreadyKnown?: number;
  new?: number;
  saved?: number;
  duplicatesFound?: number;
  errorsCount?: number;
  sourceName?: string;
  dryRun?: boolean;
  error?: string;
};

type EventEntry = {
  id: number;
  title: string;
  date: string;
  time: string;
  location: string;
  category: string;
  origin: string;
  sourceUrl: string | null;
  imageUrl: string | null;
  createdAt: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function durationLabel(start: string, end: string | null): string {
  if (!end) return "in corso";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

const STATUS_CHIP: Record<string, string> = {
  running: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  completed: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  failed: "bg-red-500/20 text-red-300 border-red-500/30",
  stopped: "bg-gray-500/20 text-gray-300 border-gray-500/30",
};

// ─── Tab: Cronologia Cron ─────────────────────────────────────────────────────

function CronHistoryTab() {
  const [runs, setRuns] = useState<CronRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cron-status?limit=100", { cache: "no-store" });
      if (!res.ok) throw new Error("Errore nel caricamento");
      const data = await res.json();
      setRuns(data.runs ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (loading) return <p className="text-gray-400 text-sm py-8 text-center">Caricamento…</p>;
  if (error) return <p className="text-red-400 text-sm py-4">{error}</p>;
  if (runs.length === 0) return <p className="text-gray-400 text-sm py-8 text-center">Nessuna esecuzione registrata.</p>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-400 text-xs">{runs.length} esecuzioni trovate</p>
        <button onClick={load} className="btn btn-ghost text-xs px-3 py-1.5">Aggiorna</button>
      </div>

      {runs.map((run) => {
        const isOpen = expanded.has(run.id);
        let parsed: ParsedResult | null = null;
        if (run.resultJson) {
          try { parsed = JSON.parse(run.resultJson); } catch { /* skip */ }
        }
        const chipClass = STATUS_CHIP[run.status] ?? STATUS_CHIP.stopped;

        return (
          <div
            key={run.id}
            className="border border-white/10 bg-white/3 overflow-hidden"
          >
            {/* Row header */}
            <button
              onClick={() => toggleExpand(run.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
            >
              <span className={`shrink-0 inline-flex px-2 py-0.5 text-[11px] font-semibold border ${chipClass}`}>
                {run.status.toUpperCase()}
              </span>
              <span className="font-mono text-sm text-white flex-1 truncate">{run.jobKey}</span>
              <span className="text-gray-400 text-xs shrink-0 hidden sm:block">
                {fmtDate(run.startedAt)}
              </span>
              <span className="text-gray-500 text-xs shrink-0">
                {durationLabel(run.startedAt, run.finishedAt)}
              </span>
              {parsed && (
                <div className="hidden lg:flex items-center gap-2 shrink-0">
                  {parsed.saved != null && (
                    <span className="text-emerald-400 text-xs font-semibold">+{parsed.saved}</span>
                  )}
                  {(parsed.errorsCount ?? 0) > 0 && (
                    <span className="text-red-400 text-xs font-semibold">{parsed.errorsCount} err</span>
                  )}
                </div>
              )}
              <span className="text-gray-500 text-xs shrink-0">{isOpen ? "▲" : "▼"}</span>
            </button>

            {/* Expanded detail */}
            {isOpen && (
              <div className="border-t border-white/10 px-4 py-4 space-y-3 text-sm">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400">
                  <span>Inizio: <span className="text-white">{fmtDate(run.startedAt)}</span></span>
                  {run.finishedAt && (
                    <span>Fine: <span className="text-white">{fmtDate(run.finishedAt)}</span></span>
                  )}
                  <span>Durata: <span className="text-white">{durationLabel(run.startedAt, run.finishedAt)}</span></span>
                </div>

                {parsed && (
                  <>
                    {parsed.error ? (
                      <p className="text-red-300 break-all">{parsed.error}</p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {[
                          { label: "Trovati", val: parsed.found ?? "—", color: "text-white" },
                          { label: "Già noti", val: parsed.alreadyKnown ?? "—", color: "text-gray-400" },
                          { label: "Nuovi", val: parsed.new ?? "—", color: "text-cyan-300" },
                          { label: parsed.dryRun ? "Salverei" : "Salvati", val: parsed.saved ?? "—", color: "text-emerald-300" },
                          { label: "Duplicati", val: parsed.duplicatesFound ?? "—", color: "text-yellow-300" },
                          { label: "Errori", val: parsed.errorsCount ?? "—", color: (parsed.errorsCount ?? 0) > 0 ? "text-red-300" : "text-gray-400" },
                        ].map(({ label, val, color }) => (
                          <div key={label} className="bg-white/5 border border-white/10 p-2 text-center">
                            <div className={`text-lg font-bold ${color}`}>{val}</div>
                            <div className="text-gray-400 text-[10px] uppercase tracking-wide mt-0.5">{label}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {run.resultJson && !parsed && (
                  <pre className="bg-white/5 border border-white/10 p-3 text-xs text-gray-300 overflow-x-auto max-h-48">
                    {run.resultJson}
                  </pre>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab: Log eventi trovati ──────────────────────────────────────────────────

function EventLogTab() {
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const LIMIT = 50;

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (p: number, q: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT), search: q });
      const res = await fetch(`/api/admin/event-log?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Errore nel caricamento");
      const data = await res.json();
      setEvents(data.events ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    load(page, debouncedSearch);
  }, [page, debouncedSearch, load]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <p className="text-gray-400 text-xs">
          {loading ? "Caricamento…" : `${total} eventi crawlati in totale`}
        </p>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca titolo, luogo, URL…"
          className="bg-white/10 border border-white/20 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-white/40 w-full sm:w-72"
        />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-white/10">
              {["ID", "Titolo", "Data", "Luogo", "Categoria", "Origine", "Aggiunto", ""].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-[11px] uppercase tracking-wider text-gray-400 font-semibold whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-gray-500 text-sm">Caricamento…</td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-gray-500 text-sm">Nessun evento trovato.</td>
              </tr>
            ) : (
              events.map((ev) => (
                <tr key={ev.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                  <td className="px-3 py-2.5 text-gray-400 font-mono text-xs">#{ev.id}</td>
                  <td className="px-3 py-2.5 max-w-[200px]">
                    <span className="text-white font-medium truncate block" title={ev.title}>
                      {ev.title}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-300 whitespace-nowrap text-xs">{ev.date}</td>
                  <td className="px-3 py-2.5 text-gray-300 max-w-[140px]">
                    <span className="truncate block text-xs" title={ev.location}>{ev.location}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-block px-1.5 py-0.5 text-[10px] bg-white/10 border border-white/10 text-gray-300 uppercase tracking-wide">
                      {ev.category}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-block px-1.5 py-0.5 text-[10px] bg-cyan-500/15 border border-cyan-500/20 text-cyan-300 font-mono">
                      {ev.origin}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                    {fmtDate(ev.createdAt)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/events/${ev.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-200 text-xs whitespace-nowrap"
                      >
                        Apri →
                      </Link>
                      {ev.sourceUrl && (
                        <a
                          href={ev.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 hover:text-gray-200 text-xs whitespace-nowrap"
                          title={ev.sourceUrl}
                        >
                          Fonte
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="btn btn-ghost text-xs px-3 py-1.5 disabled:opacity-40"
          >
            ← Precedente
          </button>
          <span className="text-gray-400 text-xs">
            Pagina {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
            className="btn btn-ghost text-xs px-3 py-1.5 disabled:opacity-40"
          >
            Successiva →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type Tab = "cron" | "events" | "appearance" | "instagram" | "messaging";

type AdminDestination = { label: string; icon: LucideIcon } & (
  { tab: Tab; href?: never } | { href: string; tab?: never }
);

const navigationGroups: { label: string; items: AdminDestination[] }[] = [
  { label: "Monitoraggio", items: [
    { tab: "cron", label: "Esecuzioni automatiche", icon: Clock3 },
    { tab: "events", label: "Eventi importati", icon: ListFilter },
  ] },
  { label: "Fonti e canali", items: [
    { href: "/cron", label: "Fonti e scansioni", icon: Globe2 },
    { tab: "messaging", label: "Account e canali", icon: Radio },
  ] },
  { label: "Pubblicazione", items: [
    { tab: "instagram", label: "Story Instagram", icon: Image },
    { href: "/admin/rassegne", label: "Rassegne", icon: CalendarRange },
  ] },
  { label: "Sito", items: [
    { tab: "appearance", label: "Categorie e citazioni", icon: Settings2 },
  ] },
];

export default function AdminLogClient() {
  const [tab, setTab] = useState<Tab>("cron");
  const activeSection = navigationGroups.flatMap(group => group.items).find(item => item.tab === tab)!;

  return (
    <main className="admin-page min-h-screen p-4 pt-24 sm:p-8 sm:pt-28 cron-page" data-testid="admin-shell">
      <div className="w-full space-y-6">

        {/* Header */}
        <div className="glass-effect p-6 sm:p-8">
          <PageHeading
            className="page-heading-compact"
            kicker="EventScanner / Console"
            title="Amministrazione"
            action={
              <Link href="/account" className="btn btn-ghost text-xs">
                <UserRound size={16} aria-hidden="true" />
                Profilo
              </Link>
            }
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
          <nav aria-label="Sezioni amministrazione" className="min-w-0 lg:sticky lg:top-24">
            <label className="block text-sm font-medium text-gray-200 lg:hidden">
              Sezione amministrazione
              <select value={tab} onChange={event => {
                const destination = navigationGroups.flatMap(group => group.items).find(item => (item.tab ?? item.href) === event.target.value);
                if (destination?.tab) setTab(destination.tab);
                else if (destination?.href) event.currentTarget.ownerDocument.defaultView?.location.assign(destination.href);
              }} className="select select-bordered mt-2 w-full min-w-0" aria-controls="admin-section">
                {navigationGroups.map(group => <optgroup key={group.label} label={group.label}>
                  {group.items.map(item => <option key={item.tab ?? item.href} value={item.tab ?? item.href}>{item.label}</option>)}
                </optgroup>)}
              </select>
            </label>
            <div className="hidden lg:block space-y-5 border-r border-white/10 pr-5">
              {navigationGroups.map(group => <div key={group.label}>
                <h2 className="admin-nav-group-title mb-2 px-3 text-xs font-semibold uppercase text-gray-400">{group.label}</h2>
                <ul className="space-y-1">
                  {group.items.map(item => {
                    const Icon = item.icon;
                    const selected = item.tab === tab;
                    const className = `flex w-full items-center gap-3 rounded-md border-l-2 px-3 py-2.5 text-left text-sm transition-colors ${selected ? "border-white bg-white/10 text-white font-semibold" : "border-transparent text-gray-300 hover:bg-white/5 hover:text-white"}`;
                    return <li key={item.tab ?? item.href}>
                      {item.tab ? <button type="button" className={className} aria-current={selected ? "location" : undefined} aria-controls="admin-section" onClick={() => setTab(item.tab!)}>
                        <Icon size={18} className="shrink-0" aria-hidden="true" /><span>{item.label}</span>
                      </button> : <Link href={item.href} className={className}>
                        <Icon size={18} className="shrink-0" aria-hidden="true" /><span>{item.label}</span>
                      </Link>}
                    </li>;
                  })}
                </ul>
              </div>)}
            </div>
          </nav>
          <section id="admin-section" aria-labelledby="admin-section-heading" className="min-w-0 space-y-4">
            <h2 id="admin-section-heading" className="text-xl font-semibold text-white">{activeSection.label}</h2>
            <div className="glass-effect p-4 sm:p-6 min-w-0">
          {tab === "cron" ? (
            <CronHistoryTab />
          ) : tab === "events" ? (
            <EventLogTab />
          ) : tab === "instagram" ? (
            <InstagramStoryTab />
          ) : tab === "messaging" ? (
            <MessagingAccountsTab />
          ) : (
            <SiteSettingsTab />
          )}
            </div>
          </section>
        </div>

      </div>
    </main>
  );
}
