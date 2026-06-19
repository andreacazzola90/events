"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type CronSource = {
  id: number;
  name: string;
  listUrl: string;
  scheduleCron: string;
  timezone: string;
  eventLinkSelector: string;
  listingContainerSelector: string | null;
  nextPageSelector: string | null;
  includePattern: string | null;
  excludePattern: string | null;
  waitMs: number;
  requestTimeoutMs: number;
  maxPages: number;
  maxLinksPerRun: number;
  renderJs: boolean;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  id?: number;
  name: string;
  listUrl: string;
  scheduleCron: string;
  timezone: string;
  eventLinkSelector: string;
  listingContainerSelector: string;
  nextPageSelector: string;
  includePattern: string;
  excludePattern: string;
  waitMs: number;
  requestTimeoutMs: number;
  maxPages: number;
  maxLinksPerRun: number;
  renderJs: boolean;
  isActive: boolean;
  notes: string;
};

type SelectorInspectResult = {
  scannedUrl: string;
  eventLinkSelector: string;
  eventMatches: number;
  eventLinksFound: number;
  sampleEventLinks: string[];
  nextPageSelector: string | null;
  nextPageMatched: boolean;
  nextPageHref: string | null;
  suggestedNextSelectors: string[];
  paginationType: string;
  screenshotBase64?: string;
  title: string;
};

type CronRunResult = {
  status: "success" | "dry-run" | "error";
  sourceId?: number;
  sourceName?: string;
  dryRun?: boolean;
  found?: number;
  alreadyKnown?: number;
  new?: number;
  saved?: number;
  duplicatesFound?: number;
  errorsCount?: number;
  savedEvents?: {
    id: number;
    title: string;
    date: string;
    time: string;
    location: string;
    sourceUrl: string | null;
    imageUrl?: string | null;
  }[];
  duplicates?: {
    title: string;
    date: string;
    existingId: number;
    sourceUrl: string;
  }[];
  errors?: { url: string; error: string }[];
  links?: { url: string; status: string; error?: string }[];
  dryRunStats?: { wouldSave: number; skippedPast: number; skippedDuplicate: number };
  error?: string;
};

type SavedEvent = {
  id?: number;
  title: string;
  date: string;
  time: string;
  location: string;
  sourceUrl: string | null;
  imageUrl?: string | null;
};

type LiveState = {
  phase: "scanning" | "processing" | "done";
  currentUrl?: string;
  currentIndex?: number;
  totalLinks?: number;
  totalFound?: number;
  alreadyKnown?: number;
  skippedPast?: number;
  isDryRun?: boolean;
  savedEvents: SavedEvent[];
  duplicates: { title: string; date: string; existingId: number; sourceUrl: string }[];
  errors: { url: string; error: string }[];
};

const initialForm: FormState = {
  name: "",
  listUrl: "",
  scheduleCron: "0 4 * * *",
  timezone: "Europe/Rome",
  eventLinkSelector: "a[href]",
  listingContainerSelector: "",
  nextPageSelector: "",
  includePattern: "",
  excludePattern: "",
  waitMs: 3000,
  requestTimeoutMs: 60000,
  maxPages: 10,
  maxLinksPerRun: 200,
  renderJs: true,
  isActive: true,
  notes: "",
};

function toFormState(item: CronSource): FormState {
  return {
    id: item.id,
    name: item.name,
    listUrl: item.listUrl,
    scheduleCron: item.scheduleCron,
    timezone: item.timezone,
    eventLinkSelector: item.eventLinkSelector,
    listingContainerSelector: item.listingContainerSelector || "",
    nextPageSelector: item.nextPageSelector || "",
    includePattern: item.includePattern || "",
    excludePattern: item.excludePattern || "",
    waitMs: item.waitMs,
    requestTimeoutMs: item.requestTimeoutMs,
    maxPages: item.maxPages,
    maxLinksPerRun: item.maxLinksPerRun,
    renderJs: item.renderJs,
    isActive: item.isActive,
    notes: item.notes || "",
  };
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  saved: { label: "Salvato", className: "bg-emerald-500/20 text-emerald-300" },
  "no-new-events": { label: "Nessun evento", className: "bg-gray-500/20 text-gray-300" },
  duplicate: { label: "Duplicato", className: "bg-yellow-500/20 text-yellow-300" },
  past: { label: "Passato", className: "bg-gray-500/20 text-gray-400" },
  error: { label: "Errore", className: "bg-red-500/20 text-red-300" },
  pending: { label: "In attesa", className: "bg-blue-500/20 text-blue-300" },
};

function LiveProgressPanel({ live, onClose }: { live: LiveState; onClose: () => void }) {
  const isDone = live.phase === "done";
  const pct =
    live.totalLinks && live.currentIndex
      ? Math.round((live.currentIndex / live.totalLinks) * 100)
      : null;

  return (
    <div className="mt-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 sm:p-5 space-y-4 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {!isDone && (
            <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          )}
          <span className="text-cyan-200 font-semibold">
            {live.phase === "scanning" && "Scansione pagine in corso…"}
            {live.phase === "processing" && (
              <>
                Elaborazione{" "}
                {live.currentIndex != null && live.totalLinks != null
                  ? `${live.currentIndex} / ${live.totalLinks}`
                  : ""}
              </>
            )}
            {isDone && "Scansione completata"}
          </span>
        </div>
        {isDone && (
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
        )}
      </div>

      {/* Progress bar */}
      {pct !== null && !isDone && (
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-cyan-400 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Stats row */}
      {(live.totalFound != null || live.alreadyKnown != null) && (
        <div className="flex flex-wrap gap-3 text-xs text-gray-300">
          {live.totalFound != null && (
            <span className="rounded bg-white/5 px-2 py-1">
              <span className="text-white font-semibold">{live.totalFound}</span> link trovati
            </span>
          )}
          {live.alreadyKnown != null && (
            <span className="rounded bg-white/5 px-2 py-1">
              <span className="text-white font-semibold">{live.alreadyKnown}</span> già noti
            </span>
          )}
          {live.savedEvents.length > 0 && (
            <span className="rounded bg-emerald-500/20 px-2 py-1 text-emerald-300">
              <span className="font-semibold">{live.savedEvents.length}</span>{" "}
              {live.isDryRun ? "salverei" : "salvati"}
            </span>
          )}
          {live.duplicates.length > 0 && (
            <span className="rounded bg-yellow-500/20 px-2 py-1 text-yellow-300">
              <span className="font-semibold">{live.duplicates.length}</span> duplicati
            </span>
          )}
          {(live.skippedPast ?? 0) > 0 && (
            <span className="rounded bg-gray-500/20 px-2 py-1 text-gray-400">
              <span className="font-semibold">{live.skippedPast}</span> passati saltati
            </span>
          )}
          {live.errors.length > 0 && (
            <span className="rounded bg-red-500/20 px-2 py-1 text-red-300">
              <span className="font-semibold">{live.errors.length}</span> errori
            </span>
          )}
        </div>
      )}

      {/* Current URL being processed */}
      {live.currentUrl && live.phase === "processing" && !isDone && (
        <p className="text-gray-400 text-xs truncate">
          Analizzo: <span className="text-cyan-300">{live.currentUrl}</span>
        </p>
      )}

      {/* Live event cards */}
      {live.savedEvents.length > 0 && (
        <div>
          <h3 className="text-white font-semibold mb-2 text-xs uppercase tracking-wide">
            {live.isDryRun ? "📋 Salverei" : "✅ Aggiunti"} ({live.savedEvents.length})
          </h3>
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {live.savedEvents.map((ev, i) => (
              <div
                key={ev.id ?? i}
                className="flex items-center gap-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 animate-fade-in"
              >
                {ev.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ev.imageUrl}
                    alt=""
                    className="w-10 h-10 rounded object-cover shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium text-sm truncate">{ev.title}</div>
                  <div className="text-gray-400 text-xs mt-0.5">
                    {ev.date}{ev.time ? ` • ${ev.time}` : ""}{ev.location ? ` • ${ev.location}` : ""}
                  </div>
                </div>
                {ev.id && (
                  <a
                    href={`/events/${ev.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:text-cyan-200 text-xs whitespace-nowrap shrink-0"
                  >
                    #{ev.id} →
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RunResultPanel({ result, onClose }: { result: CronRunResult; onClose: () => void }) {
  const [linksOpen, setLinksOpen] = useState(false);

  if (result.status === "error") {
    return (
      <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-red-100">Errore durante l&apos;esecuzione</span>
          <button onClick={onClose} className="text-red-300 hover:text-white text-lg leading-none">&times;</button>
        </div>
        <p className="break-all">{result.error}</p>
      </div>
    );
  }

  const isDry = result.dryRun;

  return (
    <div className="mt-4 rounded-xl border border-white/20 bg-white/5 p-4 sm:p-5 space-y-4 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${isDry ? "bg-yellow-500/20 text-yellow-200" : "bg-emerald-500/20 text-emerald-200"}`}>
            {isDry ? "DRY RUN" : "ESEGUITO"}
          </span>
          <span className="text-white font-semibold">{result.sourceName}</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { label: "Link trovati", value: result.found ?? 0, color: "text-white" },
          { label: "Già noti", value: result.alreadyKnown ?? 0, color: "text-gray-400" },
          { label: "Nuovi", value: result.new ?? 0, color: "text-cyan-300" },
          { label: isDry ? "Salverei" : "Salvati", value: result.saved ?? 0, color: "text-emerald-300" },
          { label: "Duplicati", value: result.duplicatesFound ?? 0, color: "text-yellow-300" },
          { label: "Errori", value: result.errorsCount ?? 0, color: (result.errorsCount ?? 0) > 0 ? "text-red-300" : "text-gray-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg bg-white/5 border border-white/10 p-3 text-center">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-gray-400 text-[11px] mt-1 uppercase tracking-wide">{label}</div>
          </div>
        ))}
      </div>

      {/* Saved events */}
      {(result.savedEvents?.length ?? 0) > 0 && (
        <div>
          <h3 className="text-white font-semibold mb-2">
            ✅ {isDry ? "Salverei" : "Salvati"} ({result.savedEvents!.length})
          </h3>
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {result.savedEvents!.map((ev) => (
              <div key={ev.id} className="flex items-start gap-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium truncate">{ev.title}</div>
                  <div className="text-gray-400 text-xs mt-0.5">
                    {ev.date}{ev.time ? ` • ${ev.time}` : ""}{ev.location ? ` • ${ev.location}` : ""}
                  </div>
                </div>
                <a
                  href={`/events/${ev.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:text-cyan-200 text-xs whitespace-nowrap shrink-0"
                >
                  #{ev.id} →
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Duplicates */}
      {(result.duplicates?.length ?? 0) > 0 && (
        <div>
          <h3 className="text-yellow-200 font-semibold mb-2">
            ⚠️ Duplicati ignorati ({result.duplicates!.length})
          </h3>
          <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
            {result.duplicates!.map((d, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-xs">
                <div className="flex-1 min-w-0">
                  <span className="text-yellow-100 font-medium">{d.title}</span>
                  <span className="text-gray-400 ml-2">{d.date}</span>
                </div>
                <a
                  href={`/events/${d.existingId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:text-cyan-200 whitespace-nowrap shrink-0"
                >
                  Esistente #{d.existingId} →
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Errors */}
      {(result.errors?.length ?? 0) > 0 && (
        <div>
          <h3 className="text-red-200 font-semibold mb-2">
            ❌ Errori ({result.errors!.length})
          </h3>
          <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
            {result.errors!.map((e, i) => (
              <div key={i} className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs">
                <div className="text-red-200 font-medium break-all">{e.error}</div>
                <div className="text-gray-400 break-all mt-0.5">{e.url}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Links detail (collapsible) */}
      {(result.links?.length ?? 0) > 0 && (
        <div>
          <button
            onClick={() => setLinksOpen((v) => !v)}
            className="text-gray-300 hover:text-white text-xs flex items-center gap-1"
          >
            <span>{linksOpen ? "▼" : "▶"}</span>
            <span>Dettaglio link ({result.links!.length})</span>
          </button>
          {linksOpen && (
            <div className="mt-2 max-h-52 overflow-y-auto space-y-0.5 pr-1">
              {result.links!.map((l, i) => {
                const s = STATUS_LABELS[l.status] ?? { label: l.status, className: "bg-gray-500/20 text-gray-300" };
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={`shrink-0 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${s.className}`}>
                      {s.label}
                    </span>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-200 break-all truncate"
                      title={l.url}
                    >
                      {l.url}
                    </a>
                    {l.error && <span className="text-red-300 shrink-0">— {l.error}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CronAdminClient() {
  const router = useRouter();
  const [items, setItems] = useState<CronSource[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoDiscoveryInfo, setAutoDiscoveryInfo] = useState<{
    confidence: number;
    listingSelector?: string | null;
    sampleEventUrl?: string | null;
  } | null>(null);
  const [inspectingSelectors, setInspectingSelectors] = useState(false);
  const [inspectResult, setInspectResult] = useState<SelectorInspectResult | null>(null);
  const [generatingSelectors, setGeneratingSelectors] = useState(false);

  // Per-source run state
  const [runningSourceId, setRunningSourceId] = useState<number | null>(null);
  const [sourceResults, setSourceResults] = useState<Record<number, CronRunResult>>({});
  const [sourceLive, setSourceLive] = useState<Record<number, LiveState>>({});

  const isEditing = useMemo(() => typeof form.id === "number", [form.id]);

  const loadSources = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cron-sources", { cache: "no-store" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Impossibile caricare le sorgenti cron");
      }
      const payload = (await res.json()) as CronSource[];
      setItems(payload);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSources();
  }, []);

  const handleChange = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm(initialForm);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const method = isEditing ? "PATCH" : "POST";
      const res = await fetch("/api/admin/cron-sources", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Errore durante il salvataggio");
      }

      const payload = await res.json().catch(() => ({}));
      setAutoDiscoveryInfo(payload?.autoDiscovery || null);
      resetForm();
      await loadSources();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleInspectSelectors = async () => {
    if (!form.listUrl) {
      setError("Inserisci prima l'URL lista eventi.");
      return;
    }

    setInspectingSelectors(true);
    setError(null);
    setInspectResult(null);

    try {
      const res = await fetch("/api/admin/cron-sources/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: form.listUrl,
          eventLinkSelector: form.eventLinkSelector,
          listingContainerSelector: form.listingContainerSelector,
          nextPageSelector: form.nextPageSelector,
          waitMs: form.waitMs,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || payload?.details || "Errore durante l'analisi selettori");
      }

      setInspectResult(payload?.result || null);

      if (!form.nextPageSelector && Array.isArray(payload?.result?.suggestedNextSelectors)) {
        const firstSuggestion = payload.result.suggestedNextSelectors[0];
        if (firstSuggestion) handleChange("nextPageSelector", firstSuggestion);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setInspectingSelectors(false);
    }
  };

  const handleGenerateSelectors = async () => {
    if (!form.listUrl) {
      setError("Inserisci prima l'URL lista eventi.");
      return;
    }

    setGeneratingSelectors(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/cron-sources/generate-selectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: form.listUrl, listingContainerSelector: form.listingContainerSelector, waitMs: form.waitMs }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || payload?.details || "Errore durante la generazione selettori");
      }

      const result = payload?.result;
      if (result?.eventLinkSelector) handleChange("eventLinkSelector", result.eventLinkSelector);
      if (result?.listingContainerSelector) handleChange("listingContainerSelector", result.listingContainerSelector);
      if (result?.nextPageSelector) handleChange("nextPageSelector", result.nextPageSelector);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGeneratingSelectors(false);
    }
  };

  const handleEdit = (item: CronSource) => {
    setForm(toFormState(item));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Eliminare questa sorgente cron?")) return;

    setError(null);
    try {
      const res = await fetch(`/api/admin/cron-sources?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Errore durante l'eliminazione");
      }
      await loadSources();
      if (form.id === id) resetForm();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleToggleActive = async (item: CronSource) => {
    setError(null);
    try {
      const payload = { ...toFormState(item), id: item.id, isActive: !item.isActive };
      const res = await fetch("/api/admin/cron-sources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Errore nel cambio stato");
      }

      await loadSources();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleRunSource = async (sourceId: number, dryRun: boolean) => {
    setRunningSourceId(sourceId);
    setSourceResults((prev) => { const n = { ...prev }; delete n[sourceId]; return n; });
    setSourceLive((prev) => ({
      ...prev,
      [sourceId]: { phase: "scanning", savedEvents: [], duplicates: [], errors: [], isDryRun: dryRun },
    }));

    try {
      const res = await fetch("/api/admin/run-cron/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId, dryRun }),
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Errore nel server");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE frames from buffer
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            const msg = JSON.parse(dataLine.slice(6));

            if (msg.type === "page") {
              setSourceLive((prev) => ({
                ...prev,
                [sourceId]: { ...prev[sourceId], phase: "scanning" },
              }));
            } else if (msg.type === "links") {
              setSourceLive((prev) => ({
                ...prev,
                [sourceId]: {
                  ...prev[sourceId],
                  phase: "processing",
                  totalFound: msg.filtered,
                  totalLinks: msg.filtered,
                  alreadyKnown: undefined,
                },
              }));
            } else if (msg.type === "queue") {
              setSourceLive((prev) => ({
                ...prev,
                [sourceId]: {
                  ...prev[sourceId],
                  totalLinks: msg.newLinks,
                  alreadyKnown: msg.alreadyKnown,
                },
              }));
            } else if (msg.type === "processing") {
              setSourceLive((prev) => ({
                ...prev,
                [sourceId]: {
                  ...prev[sourceId],
                  phase: "processing",
                  currentUrl: msg.url,
                  currentIndex: msg.index,
                  totalLinks: msg.total,
                },
              }));
            } else if (msg.type === "skipped-past") {
              setSourceLive((prev) => ({
                ...prev,
                [sourceId]: {
                  ...prev[sourceId],
                  skippedPast: (prev[sourceId]?.skippedPast ?? 0) + 1,
                },
              }));
            } else if (msg.type === "event" || msg.type === "dry-event") {
              const ev = msg.type === "event" ? msg.event : { id: undefined, title: msg.title, date: msg.date, location: msg.location, time: "", sourceUrl: msg.url, imageUrl: undefined };
              setSourceLive((prev) => ({
                ...prev,
                [sourceId]: {
                  ...prev[sourceId],
                  savedEvents: [...(prev[sourceId]?.savedEvents ?? []), ev],
                },
              }));
            } else if (msg.type === "duplicate") {
              setSourceLive((prev) => ({
                ...prev,
                [sourceId]: {
                  ...prev[sourceId],
                  duplicates: [...(prev[sourceId]?.duplicates ?? []), msg],
                },
              }));
            } else if (msg.type === "error") {
              setSourceLive((prev) => ({
                ...prev,
                [sourceId]: {
                  ...prev[sourceId],
                  errors: [...(prev[sourceId]?.errors ?? []), { url: msg.url, error: msg.error }],
                },
              }));
            } else if (msg.type === "done") {
              setSourceLive((prev) => ({
                ...prev,
                [sourceId]: { ...prev[sourceId], phase: "done" },
              }));
              setSourceResults((prev) => ({ ...prev, [sourceId]: { ...msg, status: msg.status } }));
            }
          } catch {
            // ignore malformed frame
          }
        }
      }
    } catch (err) {
      setSourceResults((prev) => ({
        ...prev,
        [sourceId]: { status: "error", error: (err as Error).message },
      }));
      setSourceLive((prev) => ({ ...prev, [sourceId]: { ...prev[sourceId], phase: "done" } }));
    } finally {
      setRunningSourceId(null);
    }
  };

  return (
    <main className="min-h-screen p-6 pt-24 sm:p-8 sm:pt-28 cron-page">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="glass-effect rounded-2xl p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold text-white">Cron Admin</h1>
              <p className="text-gray-300 mt-2 text-sm sm:text-base">
                Configura i siti da scrappare giornalmente e monitora i risultati.
              </p>
            </div>
            <button type="button" onClick={() => router.push("/account")} className="btn btn-ghost">
              Torna a Profilo
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="glass-effect rounded-2xl p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
            <h2 className="text-2xl font-semibold text-white">
              {isEditing ? "Modifica sorgente" : "Nuova sorgente"}
            </h2>
            {isEditing && (
              <button type="button" onClick={resetForm} className="btn btn-secondary">
                Annulla modifica
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm text-gray-200 space-y-2">
              <span>Nome sorgente *</span>
              <input
                className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white"
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="Es. Visit Pedemontana"
                required
              />
            </label>

            <label className="text-sm text-gray-200 space-y-2">
              <span>URL lista eventi *</span>
              <input
                className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white"
                value={form.listUrl}
                onChange={(e) => handleChange("listUrl", e.target.value)}
                placeholder="https://example.com/events"
                required
                type="url"
              />
            </label>

            <div className="text-sm text-gray-200 space-y-2">
              <span>Setup assistito</span>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={form.listUrl || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`btn btn-outline ${!form.listUrl ? "pointer-events-none opacity-50" : ""}`}
                >
                  Apri sito
                </a>
                <button
                  type="button"
                  onClick={handleInspectSelectors}
                  disabled={inspectingSelectors || generatingSelectors || !form.listUrl}
                  className="btn btn-outline"
                >
                  {inspectingSelectors ? "Analisi in corso..." : "Verifica selettori"}
                </button>
                <button
                  type="button"
                  onClick={handleGenerateSelectors}
                  disabled={generatingSelectors || inspectingSelectors || !form.listUrl}
                  className="btn btn-outline"
                >
                  {generatingSelectors ? "Generazione in corso..." : "Genera selettori"}
                </button>
              </div>
            </div>

            <label className="text-sm text-gray-200 space-y-2">
              <span>Cron schedule</span>
              <input
                className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white"
                value={form.scheduleCron}
                onChange={(e) => handleChange("scheduleCron", e.target.value)}
                placeholder="0 4 * * *"
              />
            </label>

            <label className="text-sm text-gray-200 space-y-2">
              <span>Timezone</span>
              <input
                className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white"
                value={form.timezone}
                onChange={(e) => handleChange("timezone", e.target.value)}
                placeholder="Europe/Rome"
              />
            </label>

            <label className="text-sm text-gray-200 space-y-2">
              <span>Container listing eventi (selector)</span>
              <input
                className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white"
                value={form.listingContainerSelector}
                onChange={(e) => handleChange("listingContainerSelector", e.target.value)}
                placeholder="#events-list"
              />
              <span className="block text-xs text-gray-400">
                Selettore del wrapper che contiene tutte le card eventi. Aiuta a isolare il listing dal resto della pagina.
              </span>
            </label>

            <label className="text-sm text-gray-200 space-y-2">
              <span>Selector card evento</span>
              <input
                className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white"
                value={form.eventLinkSelector}
                onChange={(e) => handleChange("eventLinkSelector", e.target.value)}
                placeholder="article.event-card"
              />
              <span className="block text-xs text-gray-400">
                Selettore della card/contenitore dell&apos;evento nel listing. Il link viene estratto automaticamente.
              </span>
            </label>

            <label className="text-sm text-gray-200 space-y-2">
              <span>Blocco paginazione (selector)</span>
              <input
                className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white"
                value={form.nextPageSelector}
                onChange={(e) => handleChange("nextPageSelector", e.target.value)}
                placeholder=".pagination"
              />
              <span className="block text-xs text-gray-400">
                Selettore del blocco/contenitore di paginazione. Il tipo (frecce o numerata) viene rilevato automaticamente.
              </span>
            </label>

            <label className="text-sm text-gray-200 space-y-2">
              <span>Regex include URL</span>
              <input
                className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white"
                value={form.includePattern}
                onChange={(e) => handleChange("includePattern", e.target.value)}
                placeholder="/eventi/"
              />
            </label>

            <label className="text-sm text-gray-200 space-y-2">
              <span>Regex exclude URL</span>
              <input
                className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white"
                value={form.excludePattern}
                onChange={(e) => handleChange("excludePattern", e.target.value)}
                placeholder="/tag|/author"
              />
            </label>

            <label className="text-sm text-gray-200 space-y-2">
              <span>Attendi dopo caricamento (secondi)</span>
              <input
                className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white"
                value={Number((form.waitMs / 1000).toFixed(2))}
                onChange={(e) => {
                  const seconds = Number(e.target.value);
                  const nextMs = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds * 1000)) : 0;
                  handleChange("waitMs", nextMs);
                }}
                type="number"
                min={0}
                step={0.1}
              />
            </label>

            <label className="text-sm text-gray-200 space-y-2">
              <span>Timeout richiesta ms</span>
              <input
                className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white"
                value={form.requestTimeoutMs}
                onChange={(e) => handleChange("requestTimeoutMs", Number(e.target.value) || 1000)}
                type="number"
                min={1000}
              />
            </label>

            <label className="text-sm text-gray-200 space-y-2">
              <span>Max pagine</span>
              <input
                className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white"
                value={form.maxPages}
                onChange={(e) => handleChange("maxPages", Number(e.target.value) || 1)}
                type="number"
                min={1}
              />
            </label>

            <label className="text-sm text-gray-200 space-y-2">
              <span>Max link per run</span>
              <input
                className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white"
                value={form.maxLinksPerRun}
                onChange={(e) => handleChange("maxLinksPerRun", Number(e.target.value) || 1)}
                type="number"
                min={1}
              />
            </label>

            <label className="text-sm text-gray-200 space-y-2 md:col-span-2">
              <span>Note operative</span>
              <textarea
                className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white min-h-[90px]"
                value={form.notes}
                onChange={(e) => handleChange("notes", e.target.value)}
                placeholder="Es. il sito richiede rendering JS e filtro su /eventi/"
              />
            </label>

            <div className="md:col-span-2 flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-2 text-sm text-gray-200">
                <input
                  type="checkbox"
                  checked={form.renderJs}
                  onChange={(e) => handleChange("renderJs", e.target.checked)}
                />
                Render JS (headless browser)
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-200">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => handleChange("isActive", e.target.checked)}
                />
                Attivo nel run giornaliero
              </label>
            </div>

            <div className="md:col-span-2">
              <button type="submit" disabled={saving} className="btn btn-accent">
                {saving ? "Salvataggio..." : isEditing ? "Aggiorna sorgente" : "Aggiungi sorgente"}
              </button>
            </div>
          </form>

          {error && (
            <div className="mt-4 rounded-xl border border-red-500/50 bg-red-500/15 text-red-100 px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {autoDiscoveryInfo && (
            <div className="mt-4 rounded-xl border border-black/20 bg-white px-4 py-3 text-sm text-black">
              <p className="font-semibold">Auto-discovery completata</p>
              <p className="text-black/70">Confidenza: {autoDiscoveryInfo.confidence}%</p>
              {autoDiscoveryInfo.listingSelector && (
                <p className="text-black/70 break-all">Listing selector: {autoDiscoveryInfo.listingSelector}</p>
              )}
              {autoDiscoveryInfo.sampleEventUrl && (
                <p className="text-black/70 break-all">Evento esempio: {autoDiscoveryInfo.sampleEventUrl}</p>
              )}
            </div>
          )}

          {inspectResult && (
            <div className="mt-4 rounded-xl border border-black/20 bg-white px-4 py-3 text-sm text-black space-y-3">
              <p className="font-semibold text-base">Verifica selettori completata</p>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-black/70">
                <span className="font-medium text-black">Pagina:</span>
                <span className="break-all">{inspectResult.scannedUrl}</span>
                <span className="font-medium text-black">Titolo:</span>
                <span>{inspectResult.title}</span>
                <span className="font-medium text-black">Eventi trovati:</span>
                <span>
                  <span className="font-bold text-green-700">{inspectResult.eventMatches}</span> elementi /{" "}
                  <span className="font-bold text-green-700">{inspectResult.eventLinksFound}</span> link unici
                </span>
                <span className="font-medium text-black">Paginazione:</span>
                <span>
                  {inspectResult.nextPageMatched ? (
                    <span className="text-green-700 font-semibold">trovata</span>
                  ) : (
                    <span className="text-orange-600 font-semibold">non trovata</span>
                  )}
                  {inspectResult.nextPageHref && (
                    <span className="ml-1 break-all text-black/50">({inspectResult.nextPageHref})</span>
                  )}
                </span>
                <span className="font-medium text-black">Tipo paginazione:</span>
                <span>
                  {inspectResult.paginationType === "none" && (
                    <span className="text-gray-500">non rilevata</span>
                  )}
                  {inspectResult.paginationType === "arrows" && (
                    <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                      ← → Frecce
                    </span>
                  )}
                  {inspectResult.paginationType === "numbered" && (
                    <span className="inline-flex items-center gap-1 text-blue-700 font-semibold">
                      1 2 3 … Numerata
                    </span>
                  )}
                  {inspectResult.paginationType === "arrows+numbered" && (
                    <span className="inline-flex items-center gap-1 text-purple-700 font-semibold">
                      ← 1 2 3 → Frecce + numeri
                    </span>
                  )}
                  {inspectResult.paginationType === "load-more" && (
                    <span className="inline-flex items-center gap-1 text-teal-700 font-semibold">
                      ↓ Carica altri
                    </span>
                  )}
                </span>
              </div>

              {inspectResult.suggestedNextSelectors.length > 0 && (
                <p className="text-black/70 break-all">
                  <span className="font-medium text-black">Suggerimenti selector:</span>{" "}
                  {inspectResult.suggestedNextSelectors.join(" | ")}
                </p>
              )}

              {inspectResult.sampleEventLinks.length > 0 && (
                <div>
                  <p className="font-medium text-black mb-1">Esempi link evento:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    {inspectResult.sampleEventLinks.slice(0, 5).map((link) => (
                      <li key={link} className="break-all text-black/60 text-xs">{link}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Screenshot con overlay colorati */}
              {inspectResult.screenshotBase64 && (
                <div>
                  <p className="font-medium text-black mb-2">Screenshot con overlay:</p>
                  <div className="flex gap-3 mb-2 text-xs flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-3 h-3 rounded border-2 border-green-500 bg-green-100 inline-block" />
                      <span className="text-green-700 font-semibold">Verde = eventi</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-3 h-3 rounded border-2 border-amber-500 bg-amber-100 inline-block" />
                      <span className="text-amber-700 font-semibold">Arancione = paginazione</span>
                    </span>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={inspectResult.screenshotBase64}
                    alt="Screenshot pagina con overlay selettori"
                    className="w-full rounded-lg border border-black/20 shadow"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sources table */}
        <div className="glass-effect rounded-2xl p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <h2 className="text-2xl font-semibold text-white">Sorgenti configurate</h2>
            <button type="button" onClick={loadSources} className="btn btn-ghost" disabled={loading}>
              {loading ? "Aggiornamento..." : "Ricarica"}
            </button>
          </div>

          {loading ? (
            <div className="text-gray-300">Caricamento sorgenti...</div>
          ) : items.length === 0 ? (
            <div className="text-gray-300">Nessuna sorgente configurata.</div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const isRunning = runningSourceId === item.id;
                const result = sourceResults[item.id];
                const live = sourceLive[item.id];

                return (
                  <div key={item.id} className="rounded-xl border border-white/15 bg-white/5 p-4 sm:p-5">
                    {/* Source header */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white text-base">{item.name}</span>
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                              item.isActive
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-gray-500/20 text-gray-400"
                            }`}
                          >
                            {item.isActive ? "Attivo" : "Disattivo"}
                          </span>
                          <span className="text-gray-400 text-xs">{item.scheduleCron} ({item.timezone})</span>
                        </div>
                        <a
                          href={item.listUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-300 hover:text-cyan-200 text-sm break-all"
                        >
                          {item.listUrl}
                        </a>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-gray-400">
                          <span>maxPages: {item.maxPages}</span>
                          <span>maxLinks: {item.maxLinksPerRun}</span>
                          <span>wait: {item.waitMs}ms</span>
                          <span>timeout: {item.requestTimeoutMs}ms</span>
                          <span>JS: {item.renderJs ? "sì" : "no"}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleRunSource(item.id, true)}
                          disabled={isRunning || runningSourceId !== null}
                          className="btn btn-outline btn-sm"
                        >
                          {isRunning ? "⏳ Scanning..." : "🔍 Dry run"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRunSource(item.id, false)}
                          disabled={isRunning || runningSourceId !== null}
                          className="btn btn-secondary btn-sm"
                        >
                          {isRunning ? "⏳ Scanning..." : "▶ Esegui ora"}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(item)}>
                          Modifica
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleToggleActive(item)}>
                          {item.isActive ? "Disattiva" : "Attiva"}
                        </button>
                        <button className="btn btn-sm" onClick={() => handleDelete(item.id)}>
                          Elimina
                        </button>
                      </div>
                    </div>

                    {/* Live progress panel (while running or just finished) */}
                    {live && live.phase !== "done" && (
                      <LiveProgressPanel live={live} onClose={() => {}} />
                    )}

                    {/* Final result panel (after stream completes) — only shown if live panel is closed */}
                    {live?.phase === "done" && !result && (
                      <LiveProgressPanel
                        live={live}
                        onClose={() =>
                          setSourceLive((prev) => {
                            const n = { ...prev };
                            delete n[item.id];
                            return n;
                          })
                        }
                      />
                    )}

                    {/* Full result panel (after explicitly keeping it open) */}
                    {result && live?.phase === "done" && (
                      <RunResultPanel
                        result={result}
                        onClose={() => {
                          setSourceResults((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
                          setSourceLive((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
