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
  title: string;
};

const initialForm: FormState = {
  name: "",
  listUrl: "",
  scheduleCron: "0 4 * * *",
  timezone: "Europe/Rome",
  eventLinkSelector: "a[href]",
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

export default function CronAdminClient() {
  const router = useRouter();
  const [items, setItems] = useState<CronSource[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningVisit, setRunningVisit] = useState(false);
  const [runResult, setRunResult] = useState<any | null>(null);
  const [testingSource, setTestingSource] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [autoDiscoveryInfo, setAutoDiscoveryInfo] = useState<{
    confidence: number;
    listingSelector?: string | null;
    sampleEventUrl?: string | null;
  } | null>(null);
  const [inspectingSelectors, setInspectingSelectors] = useState(false);
  const [inspectResult, setInspectResult] = useState<SelectorInspectResult | null>(
    null,
  );

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
        headers: {
          "Content-Type": "application/json",
        },
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: form.listUrl,
          eventLinkSelector: form.eventLinkSelector,
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
        if (firstSuggestion) {
          handleChange("nextPageSelector", firstSuggestion);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setInspectingSelectors(false);
    }
  };

  const handleEdit = (item: CronSource) => {
    setForm(toFormState(item));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: number) => {
    const shouldDelete = window.confirm("Eliminare questa sorgente cron?");
    if (!shouldDelete) {
      return;
    }

    setError(null);
    try {
      const res = await fetch(`/api/admin/cron-sources?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Errore durante l'eliminazione");
      }
      await loadSources();
      if (form.id === id) {
        resetForm();
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleToggleActive = async (item: CronSource) => {
    setError(null);
    try {
      const payload = {
        ...toFormState(item),
        id: item.id,
        isActive: !item.isActive,
      };
      const res = await fetch("/api/admin/cron-sources", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
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

  const runVisitPedemontanaCron = async () => {
    setRunningVisit(true);
    setRunResult(null);
    setError(null);

    try {
      const res = await fetch("/api/admin/run-cron/instagram-story", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ target: "visitpedemontana" }),
      });
      const payload = await res.json();
      setRunResult(payload);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunningVisit(false);
    }
  };

  const runVisitPedemontanaDryRun = async () => {
    setTestingSource(true);
    setTestResult(null);
    setError(null);

    try {
      const res = await fetch("/api/admin/run-cron/instagram-story", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ target: "visitpedemontana", dryRun: true }),
      });
      const payload = await res.json();
      setTestResult(payload);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTestingSource(false);
    }
  };

  return (
    <main className="min-h-screen p-6 pt-24 sm:p-8 sm:pt-28 cron-page">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="glass-effect rounded-2xl p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold text-white">Cron Admin</h1>
              <p className="text-gray-300 mt-2 text-sm sm:text-base">
                Configura i siti da scrappare giornalmente e i parametri operativi dello scraping.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/account")}
              className="btn btn-ghost"
            >
              Torna a Profilo
            </button>
          </div>
        </div>

        <div className="glass-effect rounded-2xl p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
            <h2 className="text-2xl font-semibold text-white">
              {isEditing ? "Modifica sorgente" : "Nuova sorgente"}
            </h2>
            {isEditing && (
              <button
                type="button"
                onClick={resetForm}
                className="btn btn-secondary"
              >
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
                  disabled={inspectingSelectors || !form.listUrl}
                  className="btn btn-outline"
                >
                  {inspectingSelectors ? "Analisi in corso..." : "Verifica selettori"}
                </button>
              </div>
              <p className="text-xs text-gray-400">
                Apri il sito in una nuova tab, individua i selettori con gli strumenti dev, poi verifica qui.
              </p>
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
              <span>Selector link evento</span>
              <input
                className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white"
                value={form.eventLinkSelector}
                onChange={(e) => handleChange("eventLinkSelector", e.target.value)}
                placeholder="a.event-link"
              />
            </label>

            <label className="text-sm text-gray-200 space-y-2">
              <span>Selector pagina successiva</span>
              <input
                className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white"
                value={form.nextPageSelector}
                onChange={(e) => handleChange("nextPageSelector", e.target.value)}
                placeholder="a[rel='next']"
              />
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
                  const nextMs = Number.isFinite(seconds)
                    ? Math.max(0, Math.round(seconds * 1000))
                    : 0;
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

            <div className="md:col-span-2 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="btn btn-accent"
              >
                {saving ? "Salvataggio..." : isEditing ? "Aggiorna sorgente" : "Aggiungi sorgente"}
              </button>

              <button
                type="button"
                onClick={runVisitPedemontanaCron}
                disabled={runningVisit}
                className="btn btn-secondary"
              >
                {runningVisit ? "Esecuzione cron..." : "Esegui ora cron VisitPedemontana"}
              </button>

              <button
                type="button"
                onClick={runVisitPedemontanaDryRun}
                disabled={testingSource}
                className="btn btn-outline"
              >
                {testingSource ? "Test in corso..." : "Test sorgente (dry-run)"}
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
                <p className="text-black/70 break-all">
                  Listing selector: {autoDiscoveryInfo.listingSelector}
                </p>
              )}
              {autoDiscoveryInfo.sampleEventUrl && (
                <p className="text-black/70 break-all">
                  Evento esempio: {autoDiscoveryInfo.sampleEventUrl}
                </p>
              )}
            </div>
          )}

          {inspectResult && (
            <div className="mt-4 rounded-xl border border-black/20 bg-white px-4 py-3 text-sm text-black space-y-2">
              <p className="font-semibold">Verifica selettori completata</p>
              <p className="text-black/70 break-all">Pagina: {inspectResult.scannedUrl}</p>
              <p className="text-black/70">Titolo: {inspectResult.title}</p>
              <p className="text-black/70">
                Match selector evento: {inspectResult.eventMatches} | Link evento trovati: {inspectResult.eventLinksFound}
              </p>
              <p className="text-black/70">
                Next page: {inspectResult.nextPageMatched ? "trovata" : "non trovata"}
                {inspectResult.nextPageHref ? ` (${inspectResult.nextPageHref})` : ""}
              </p>
              {inspectResult.suggestedNextSelectors.length > 0 && (
                <p className="text-black/70 break-all">
                  Suggerimenti next selector: {inspectResult.suggestedNextSelectors.join(" | ")}
                </p>
              )}
              {inspectResult.sampleEventLinks.length > 0 && (
                <div>
                  <p className="text-black/70">Esempi link evento:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    {inspectResult.sampleEventLinks.slice(0, 5).map((link) => (
                      <li key={link} className="break-all text-black/70">
                        {link}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {runResult && (
            <div className="mt-4 rounded-xl border border-cyan-500/50 bg-cyan-500/15 text-cyan-100 px-4 py-3 text-sm overflow-auto">
              <pre>{JSON.stringify(runResult, null, 2)}</pre>
            </div>
          )}

          {testResult && (
            <div className="mt-4 rounded-xl border border-black/20 bg-white px-4 py-3 text-sm text-black overflow-auto">
              <p className="font-semibold mb-2">Esito test sorgente</p>
              <pre>{JSON.stringify(testResult, null, 2)}</pre>
            </div>
          )}
        </div>

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
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-200">
                <thead>
                  <tr className="border-b border-white/15 text-gray-300">
                    <th className="py-2 pr-3">Nome</th>
                    <th className="py-2 pr-3">Schedule</th>
                    <th className="py-2 pr-3">Parametri</th>
                    <th className="py-2 pr-3">Stato</th>
                    <th className="py-2 pr-3">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-white/10 align-top">
                      <td className="py-3 pr-3">
                        <div className="font-semibold text-white">{item.name}</div>
                        <a
                          href={item.listUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-300 hover:text-cyan-200 break-all"
                        >
                          {item.listUrl}
                        </a>
                      </td>
                      <td className="py-3 pr-3">
                        <div>{item.scheduleCron}</div>
                        <div className="text-gray-400">{item.timezone}</div>
                      </td>
                      <td className="py-3 pr-3">
                        <div>maxPages: {item.maxPages}</div>
                        <div>maxLinks: {item.maxLinksPerRun}</div>
                        <div>waitMs: {item.waitMs}</div>
                        <div>timeoutMs: {item.requestTimeoutMs}</div>
                        <div>renderJs: {item.renderJs ? "true" : "false"}</div>
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={`inline-flex px-2 py-1 rounded-full text-xs ${
                            item.isActive
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-gray-500/20 text-gray-300"
                          }`}
                        >
                          {item.isActive ? "Attivo" : "Disattivo"}
                        </span>
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex flex-col sm:flex-row gap-2">
                          <button className="btn btn-ghost" onClick={() => handleEdit(item)}>
                            Modifica
                          </button>
                          <button className="btn btn-secondary" onClick={() => handleToggleActive(item)}>
                            {item.isActive ? "Disattiva" : "Attiva"}
                          </button>
                          <button className="btn" onClick={() => handleDelete(item.id)}>
                            Elimina
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
