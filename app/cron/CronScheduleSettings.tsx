"use client";

import { useEffect, useState } from "react";
import { CRON_JOBS, type CronJobKey } from "../../lib/cron-jobs";

type SettingsResponse = {
  jobs: { key: CronJobKey; enabled: boolean }[];
};

function isSettingsJob(value: unknown): value is SettingsResponse["jobs"][number] {
  if (!value || typeof value !== "object" || !("key" in value) || !("enabled" in value)) return false;
  return typeof value.key === "string" && CRON_JOBS.some((job) => job.key === value.key)
    && typeof value.enabled === "boolean";
}

function parseSettingsResponse(value: unknown): SettingsResponse {
  if (!value || typeof value !== "object" || !("jobs" in value) || !Array.isArray(value.jobs)) {
    throw new Error("Risposta delle impostazioni non valida");
  }
  const jobs: SettingsResponse["jobs"] = [];
  const candidates: unknown[] = value.jobs;
  for (const candidate of candidates) {
    if (!isSettingsJob(candidate)) throw new Error("Risposta delle impostazioni non valida");
    jobs.push(candidate);
  }
  if (
    jobs.length !== CRON_JOBS.length ||
    new Set(jobs.map((entry) => entry.key)).size !== CRON_JOBS.length
  ) {
    throw new Error("Risposta delle impostazioni non valida");
  }
  return { jobs };
}

export default function CronScheduleSettings() {
  const [selected, setSelected] = useState<CronJobKey[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/cron-settings", { cache: "no-store" });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === "object" && "error" in payload
          && typeof payload.error === "string" ? payload.error : "Impossibile leggere le impostazioni";
        throw new Error(message);
      }
      const settings = parseSettingsResponse(payload);
      setSelected(settings.jobs.filter((job) => job.enabled).map((job) => job.key));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Impossibile leggere le impostazioni");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const saveSettings = async () => {
    if (selected === null || saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch("/api/admin/cron-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobs: selected }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === "object" && "error" in payload
          && typeof payload.error === "string" ? payload.error : "Impossibile salvare le impostazioni";
        throw new Error(message);
      }
      const settings = parseSettingsResponse(payload);
      setSelected(settings.jobs.filter((job) => job.enabled).map((job) => job.key));
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Impossibile salvare le impostazioni");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="automatic-cron-settings-heading" className="glass-effect p-5 sm:p-6">
      <h2 id="automatic-cron-settings-heading" className="text-lg font-semibold text-white">
        Job della pianificazione giornaliera
      </h2>
      <p className="mt-1 text-sm text-gray-300">
        Scegli quali job avviare automaticamente. Alla prima configurazione sono tutti abilitati; puoi anche disabilitarli tutti.
      </p>
      <p className="mt-2 text-xs text-gray-400">
        Questa scelta vale per i prossimi avvii automatici e non limita l’avvio manuale qui sotto.
      </p>
      {loading && <p role="status" className="mt-4 text-sm text-gray-300">Caricamento impostazioni…</p>}
      {selected !== null && (
        <fieldset disabled={loading || saving} className="mt-4 grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">Job automatici abilitati</legend>
          {CRON_JOBS.map((job) => (
            <label key={job.key} className="flex items-center gap-3 text-sm text-gray-200">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={selected.includes(job.key)}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSaved(false);
                  setSelected((previous) => previous === null ? previous : checked
                    ? [...previous, job.key]
                    : previous.filter((key) => key !== job.key));
                }}
              />
              {job.label}
            </label>
          ))}
        </fieldset>
      )}
      <button
        type="button"
        className="btn btn-primary mt-4"
        disabled={loading || saving || selected === null}
        onClick={() => void saveSettings()}
      >
        {saving ? "Salvataggio…" : "Salva pianificazione"}
      </button>
      <div role="status" aria-live="polite" className="mt-3 text-sm">
        {saved && <p className="text-emerald-300">Impostazioni salvate.</p>}
        {error && (
          <div className="text-red-300">
            <p>{error}</p>
            {selected === null && (
              <button type="button" onClick={() => void loadSettings()} disabled={loading} className="mt-2 underline">
                Riprova
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
