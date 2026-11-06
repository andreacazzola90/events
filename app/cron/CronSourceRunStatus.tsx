"use client";

export type CronJobRun = {
  jobKey: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  resultJson: string | null;
};

export type CronSourceSummary = {
  id: number;
  name: string;
  isActive: boolean;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatDate(value: string | number): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data non valida" : date.toLocaleString("it-IT");
}

function statusLabel(status: string, result: JsonRecord | null): string {
  const resultStatus = readString(result?.status);
  if (status === "skipped" || resultStatus === "skipped") return "Saltata";
  if (status === "stopped") return "Interrotta";
  if (status === "running") return "In corso";
  if (status === "failed" || resultStatus === "error" || resultStatus === "partial-error") return "Fallita";
  if (resultStatus === "partial") return "Completata parzialmente";
  if (status === "completed") return "Completata";
  return `Stato non riconosciuto (${status})`;
}

function parseResult(resultJson: string | null): { result: JsonRecord | null; invalid: boolean } {
  if (!resultJson) return { result: null, invalid: false };
  try {
    const parsed: unknown = JSON.parse(resultJson);
    return isRecord(parsed) ? { result: parsed, invalid: false } : { result: null, invalid: true };
  } catch {
    return { result: null, invalid: true };
  }
}

export default function CronSourceRunStatus({
  source,
  run,
  aggregateRun,
  loading = false,
  error = null,
}: {
  source: CronSourceSummary;
  run: CronJobRun | null;
  aggregateRun: CronJobRun | null;
  loading?: boolean;
  error?: string | null;
}) {
  const aggregateStartedAt = aggregateRun ? Date.parse(aggregateRun.startedAt) : Number.NaN;
  const sourceStartedAt = run ? Date.parse(run.startedAt) : Number.NaN;
  const waitingForSource =
    source.isActive &&
    aggregateRun?.status === "running" &&
    Number.isFinite(aggregateStartedAt) &&
    (!Number.isFinite(sourceStartedAt) || aggregateStartedAt > sourceStartedAt);
  const currentRun = waitingForSource ? null : run;
  const { result, invalid } = parseResult(currentRun?.resultJson ?? null);
  const resultErrors = Array.isArray(result?.errors) ? result.errors : [];
  const links = Array.isArray(result?.links) ? result.links : [];
  const summaryErrors = readCount(result?.errorsCount) ?? resultErrors.length;
  const message = readString(result?.error) ?? readString(result?.message);
  const rateLimitRetryAt = readCount(result?.rateLimitRetryAt);
  const isFailed =
    currentRun?.status === "failed" ||
    ["error", "partial-error"].includes(readString(result?.status) ?? "");

  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-black/10 p-3 text-sm" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold text-white">{source.name} · Ultima scansione</span>
        <span className={`rounded-full px-2 py-0.5 text-xs ${
          !source.isActive
            ? "bg-gray-500/20 text-gray-300"
            : waitingForSource
              ? "bg-blue-500/20 text-blue-200"
              : isFailed
                ? "bg-red-500/20 text-red-200"
                : currentRun?.status === "running"
                  ? "bg-blue-500/20 text-blue-200"
                  : currentRun?.status === "skipped"
                    ? "bg-yellow-500/20 text-yellow-200"
                    : currentRun?.status === "stopped"
                      ? "bg-gray-500/20 text-gray-300"
                    : "bg-white/10 text-gray-200"
        }`}>
          {!source.isActive
            ? "Disattivata"
            : waitingForSource
              ? "In attesa"
              : currentRun
                ? statusLabel(currentRun.status, result)
                : loading
                  ? "Caricamento stato…"
                  : error
                    ? "Stato non disponibile"
                    : "Mai avviata"}
        </span>
        {currentRun && !waitingForSource && (
          <span className="text-xs text-gray-400">
            {currentRun.status === "skipped" ? "Verificata il" : "Avvio"}: {formatDate(currentRun.startedAt)}
            {currentRun.finishedAt && ` · Fine: ${formatDate(currentRun.finishedAt)}`}
          </span>
        )}
      </div>

      {waitingForSource && (
        <p className="mt-2 text-xs text-blue-200">Il run giornaliero è partito; la scansione del sito non è ancora iniziata.</p>
      )}
      {error && <p className="mt-2 text-xs text-red-300">Aggiornamento stato non riuscito: {error}</p>}
      {!currentRun && !waitingForSource && !loading && !error && !source.isActive && (
        <p className="mt-2 text-xs text-gray-400">Sorgente disattivata; nessuna nuova scansione prevista.</p>
      )}
      {currentRun && result && (
        <>
          {message && <p className="mt-2 break-all text-xs text-red-200">{message}</p>}
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-300">
            {[
              ["Trovati", readCount(result.found)],
              ["Nuovi", readCount(result.new)],
              ["Elaborati", readCount(result.processed)],
              ["Rinviati", readCount(result.deferred)],
              ["Errori", summaryErrors],
            ].filter((entry): entry is [string, number] => entry[1] !== null)
              .map(([label, count]) => (
                <span key={label} className="rounded bg-white/5 px-2 py-1">{label}: {count}</span>
              ))}
          </div>
          {rateLimitRetryAt !== null && (
            <p className="mt-2 text-xs text-amber-200">
              Quota AI occupata. Ripresa non prima del {formatDate(rateLimitRetryAt)}.
            </p>
          )}
        </>
      )}
      {currentRun?.status === "running" && !currentRun.resultJson && (
        <p className="mt-2 text-xs text-gray-400">Log dettagliati disponibili al termine della scansione.</p>
      )}
      {currentRun && invalid && (
        <p role="alert" className="mt-2 text-xs text-red-300">Il log salvato non è leggibile (JSON non valido).</p>
      )}
      {currentRun?.finishedAt && !currentRun.resultJson && !invalid && (
        <p className="mt-2 text-xs text-amber-200">Nessun log dettagliato persistito per questa scansione.</p>
      )}
      {currentRun && result && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-cyan-200">
            Log scansione ({links.length} link, {summaryErrors} errori)
          </summary>
          <div className="mt-2 space-y-3 text-xs">
            {resultErrors.length > 0 && (
              <div>
                <h3 className="mb-1 font-semibold text-red-200">Errori</h3>
                <ul className="space-y-1">
                  {resultErrors.map((entry, index) => {
                    const errorEntry = isRecord(entry) ? entry : null;
                    const url = readString(errorEntry?.url);
                    const detail = readString(errorEntry?.error) ?? (typeof entry === "string" ? entry : JSON.stringify(entry));
                    return (
                      <li key={`${url ?? "error"}-${index}`} className="break-all text-red-200">
                        {url && <span className="font-mono">{url}: </span>}{detail}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {message && <p className="break-all text-red-200">{message}</p>}
            {links.length > 0 && (
              <div>
                <h3 className="mb-1 font-semibold text-gray-200">Link analizzati</h3>
                <ul className="max-h-64 space-y-1 overflow-y-auto">
                  {links.map((entry, index) => {
                    const link = isRecord(entry) ? entry : null;
                    const url = readString(link?.url) ?? "(URL non disponibile)";
                    const status = readString(link?.status) ?? (link?.visited === true ? "visitato" : "non visitato");
                    const detail = readString(link?.error);
                    return (
                      <li key={`${url}-${index}`} className="break-all text-gray-300">
                        <span className="font-mono">{url}</span> — {status}
                        {detail && <span className="text-red-200">: {detail}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {resultErrors.length === 0 && links.length === 0 && !message && (
              <p className="text-gray-400">Nessun dettaglio per link o errore in questo log.</p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
