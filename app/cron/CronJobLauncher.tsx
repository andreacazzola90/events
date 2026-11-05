"use client";

import { useState } from "react";
import { CRON_JOBS, type CronJobKey, type CronJobResult } from "../../lib/cron-jobs";

export default function CronJobLauncher() {
  const [selected, setSelected] = useState<CronJobKey[]>([]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<CronJobResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const runSelected = async () => {
    if (running || !selected.length) return;
    setRunning(true);
    setResults([]);
    setError(null);
    try {
      const response = await fetch("/api/admin/run-cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobs: selected }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Impossibile avviare i cron selezionati");
      if (!Array.isArray(payload.jobs)) throw new Error("Risposta dei cron non valida");
      setResults(payload.jobs);
      if (payload.status !== "success") setError("Alcuni cron non sono stati completati. Controlla gli esiti.");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Impossibile avviare i cron selezionati");
    } finally {
      setRunning(false);
    }
  };

  return (
    <section aria-labelledby="manual-cron-heading" className="glass-effect p-5 sm:p-6">
      <h2 id="manual-cron-heading" className="text-lg font-semibold text-white">Avvio manuale cron</h2>
      <p className="mt-1 text-sm text-gray-300">
        Seleziona i cron da avviare insieme. La selezione non modifica la pianificazione giornaliera.
      </p>
      <p className="mt-2 text-xs text-gray-400">
        Le Story Instagram vengono avviate anche fuori dal giorno programmato e possono essere pubblicate secondo le impostazioni.
        Il primo cron include tutte le sorgenti web attive e la coda Telegram.
      </p>
      <fieldset disabled={running} className="mt-4 grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Cron da avviare</legend>
        {CRON_JOBS.map((job) => (
          <label key={job.key} className="flex items-center gap-3 text-sm text-gray-200">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={selected.includes(job.key)}
              onChange={(event) => {
                const checked = event.target.checked;
                setSelected((previous) => checked
                  ? [...previous, job.key]
                  : previous.filter((key) => key !== job.key));
              }}
            />
            {job.label}
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        className="btn btn-primary mt-4"
        disabled={running || selected.length === 0}
        onClick={() => void runSelected()}
      >
        {running ? "Esecuzione in corso..." : "Avvia selezionati"}
      </button>
      <div role="status" aria-live="polite" className="mt-3 text-sm">
        {running && <p className="text-gray-300">Avvio di {selected.length} cron in parallelo. Attendi gli esiti, possono servire fino a 5 minuti.</p>}
        {error && <p className="text-red-300">{error}</p>}
        {results.length > 0 && (
          <ul className="mt-2 space-y-2">
            {results.map((result) => {
              const skipped = result.ok && result.data !== null && typeof result.data === "object"
                && "status" in result.data && result.data.status === "skipped";
              return (
                <li key={result.key}>
                  <p className={result.ok ? "text-emerald-300" : "text-red-300"}>
                    {CRON_JOBS.find((job) => job.key === result.key)?.label}: {result.ok ? skipped ? "Saltato" : "Completato" : "Fallito"}
                    {result.error && ` - ${result.error}`}
                  </p>
                  {result.data !== undefined && (
                    <details className="mt-1 text-gray-300">
                      <summary className="cursor-pointer">Dettagli</summary>
                      <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(result.data, null, 2)}</pre>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
