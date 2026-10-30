"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ImageIcon, LoaderCircle, Save, Send, ShieldCheck } from "lucide-react";

type InstagramSettings = {
  igUserId: string;
  hasAccessToken: boolean;
  graphApiVersion: string;
  autoPublish: boolean;
  publishDays: number[];
  publishHour: number;
  timeZone: string;
  lastRunSlot: string | null;
  lastRunAt: string | null;
  lastMediaId: string | null;
  lastError: string | null;
  envFallback: { igUserId: boolean; accessToken: boolean };
};

type Feedback = { kind: "success" | "error"; text: string } | null;

const WEEKDAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Gio" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sab" },
  { value: 0, label: "Dom" },
];

const inputClass =
  "mt-1.5 min-h-10 w-full border border-white/15 bg-[#17191f] px-3 text-sm font-normal text-white placeholder:text-gray-500 focus:border-white/50 focus:outline-none";

export default function InstagramStoryTab() {
  const [settings, setSettings] = useState<InstagramSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [igUserId, setIgUserId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [removeToken, setRemoveToken] = useState(false);
  const [graphApiVersion, setGraphApiVersion] = useState("v22.0");
  const [autoPublish, setAutoPublish] = useState(false);
  const [publishDays, setPublishDays] = useState<number[]>([3]);
  const [publishHour, setPublishHour] = useState(20);
  const [busy, setBusy] = useState<"save" | "test" | "preview" | "publish" | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const applySettings = useCallback((data: InstagramSettings) => {
    setSettings(data);
    setIgUserId(data.igUserId);
    setGraphApiVersion(data.graphApiVersion);
    setAutoPublish(data.autoPublish);
    setPublishDays(data.publishDays);
    setPublishHour(data.publishHour);
    setAccessToken("");
    setRemoveToken(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/instagram-story", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Impossibile caricare le impostazioni");
        if (!cancelled) applySettings(data);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Errore di caricamento");
      });
    return () => {
      cancelled = true;
    };
  }, [applySettings]);

  const toggleDay = (day: number) => {
    setPublishDays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day],
    );
  };

  const handleSave = async () => {
    setBusy("save");
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/instagram-story", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          igUserId,
          graphApiVersion,
          autoPublish,
          publishDays,
          publishHour,
          ...(removeToken ? { accessToken: null } : accessToken.trim() ? { accessToken } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Salvataggio non riuscito");
      applySettings(data);
      setFeedback({ kind: "success", text: "Impostazioni Instagram salvate." });
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Salvataggio non riuscito" });
    } finally {
      setBusy(null);
    }
  };

  const handleTest = async () => {
    setBusy("test");
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/instagram-story", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Verifica non riuscita");
      setFeedback({
        kind: "success",
        text: `Connessione riuscita${data.username ? ` come @${data.username}` : ""}.`,
      });
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Verifica non riuscita" });
    } finally {
      setBusy(null);
    }
  };

  const runStory = async (publish: boolean) => {
    if (publish && !window.confirm("Pubblicare adesso la story su Instagram?")) return;
    setBusy(publish ? "publish" : "preview");
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/run-cron/instagram-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "instagram-story", publish }),
      });
      const result = await response.json();
      const data = result?.data;
      if (!response.ok || result?.status !== 200 || data?.status !== "success") {
        throw new Error(data?.details || data?.error || result?.error || "Generazione non riuscita");
      }
      if (data.latestImageUrl) setPreviewUrl(`${data.latestImageUrl}?t=${Date.now()}`);
      setFeedback({
        kind: "success",
        text: data.instagramStory?.published
          ? `Story pubblicata su Instagram (${data.totalEvents} eventi).`
          : `Anteprima generata con ${data.totalEvents} eventi.`,
      });
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Operazione non riuscita" });
    } finally {
      setBusy(null);
    }
  };

  if (loadError) {
    return <p role="alert" className="mb-0 text-sm text-red-300">{loadError}</p>;
  }

  if (!settings) {
    return (
      <p className="mb-0 inline-flex items-center gap-2 text-sm text-gray-300">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Caricamento impostazioni…
      </p>
    );
  }

  const scheduleInvalid = autoPublish && publishDays.length === 0;
  const tokenPlaceholder = settings.hasAccessToken
    ? "Token salvato: lascia vuoto per mantenerlo"
    : settings.envFallback.accessToken
      ? "Usa il token delle variabili d'ambiente"
      : "Incolla l'access token di lunga durata";

  return (
    <div className="space-y-10 text-white">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs uppercase tracking-widest text-gray-400">Social</p>
          <h2 className="mb-2 text-2xl font-black sm:text-3xl">Story Instagram</h2>
          <p className="mb-0 max-w-2xl text-sm text-gray-300">
            Collega l’account Instagram e scegli quando generare e pubblicare la story con gli eventi della settimana.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={busy !== null || scheduleInvalid}
          className="btn btn-primary inline-flex items-center gap-2 disabled:opacity-50"
        >
          {busy === "save" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          {busy === "save" ? "Salvataggio…" : "Salva modifiche"}
        </button>
      </header>

      <section aria-labelledby="instagram-access-title" className="border-t border-white/10 pt-7">
        <h3 id="instagram-access-title" className="mb-1 text-lg font-bold">Accesso</h3>
        <p className="mb-5 max-w-3xl text-sm text-gray-400">
          Serve un account Instagram Business o Creator collegato a una pagina Facebook. Da Meta for Developers
          genera un access token di lunga durata con i permessi <code>instagram_basic</code> e{" "}
          <code>instagram_content_publish</code>. Il token viene salvato cifrato e non viene più mostrato.
        </p>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_10rem]">
          <label className="block text-xs font-semibold text-gray-300">
            ID account Instagram
            <input
              inputMode="numeric"
              value={igUserId}
              onChange={(event) => setIgUserId(event.target.value.replace(/\D/g, ""))}
              placeholder={settings.envFallback.igUserId ? "Usa l'ID delle variabili d'ambiente" : "Es. 17841400000000000"}
              className={inputClass}
            />
          </label>
          <label className="block text-xs font-semibold text-gray-300">
            Access token
            <input
              type="password"
              autoComplete="off"
              value={accessToken}
              disabled={removeToken}
              onChange={(event) => setAccessToken(event.target.value)}
              placeholder={tokenPlaceholder}
              className={`${inputClass} disabled:opacity-50`}
            />
          </label>
          <label className="block text-xs font-semibold text-gray-300">
            Versione Graph API
            <input
              value={graphApiVersion}
              onChange={(event) => setGraphApiVersion(event.target.value.trim())}
              placeholder="v22.0"
              className={inputClass}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {settings.hasAccessToken && (
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={removeToken} onChange={(event) => setRemoveToken(event.target.checked)} />
              Rimuovi il token salvato
            </label>
          )}
          <button
            type="button"
            onClick={handleTest}
            disabled={busy !== null}
            className="inline-flex min-h-10 items-center gap-2 border border-white/20 px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            {busy === "test" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            Verifica connessione
          </button>
          <span className="text-xs text-gray-400">La verifica usa le credenziali già salvate.</span>
        </div>
      </section>

      <section aria-labelledby="instagram-schedule-title" className="border-t border-white/10 pt-7">
        <h3 id="instagram-schedule-title" className="mb-1 text-lg font-bold">Programmazione</h3>
        <p className="mb-5 max-w-3xl text-sm text-gray-400">
          Nei giorni e all’ora scelti ({settings.timeZone}) la story viene rigenerata con gli eventi da giovedì a
          mercoledì. Se la pubblicazione automatica è attiva, viene anche pubblicata su Instagram.
        </p>
        <label className="mb-5 flex items-center gap-3 text-sm font-semibold text-white">
          <input type="checkbox" checked={autoPublish} onChange={(event) => setAutoPublish(event.target.checked)} />
          Pubblica automaticamente su Instagram
        </label>
        <fieldset className="mb-5">
          <legend className="mb-2 text-xs font-semibold text-gray-300">Giorni</legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => {
              const active = publishDays.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  aria-pressed={active}
                  className={`min-h-10 min-w-14 border px-3 text-sm font-semibold transition-colors ${
                    active ? "border-white bg-white text-[#17191f]" : "border-white/20 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
          {scheduleInvalid && (
            <p role="alert" className="mb-0 mt-2 text-sm text-red-300">Scegli almeno un giorno.</p>
          )}
        </fieldset>
        <label className="block max-w-[12rem] text-xs font-semibold text-gray-300">
          Ora
          <select
            value={publishHour}
            onChange={(event) => setPublishHour(Number(event.target.value))}
            className={inputClass}
          >
            {Array.from({ length: 24 }, (_, hour) => (
              <option key={hour} value={hour}>{`${String(hour).padStart(2, "0")}:00`}</option>
            ))}
          </select>
        </label>
        <dl className="mt-6 grid gap-2 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]">
          <dt className="text-gray-400">Ultima esecuzione</dt>
          <dd className="mb-0 text-gray-200">
            {settings.lastRunAt ? new Date(settings.lastRunAt).toLocaleString("it-IT") : "Mai"}
          </dd>
          <dt className="text-gray-400">Ultima story pubblicata</dt>
          <dd className="mb-0 text-gray-200">{settings.lastMediaId ?? "Nessuna"}</dd>
          {settings.lastError && (
            <>
              <dt className="text-gray-400">Ultimo errore</dt>
              <dd className="mb-0 break-words text-red-300">{settings.lastError}</dd>
            </>
          )}
        </dl>
      </section>

      <section aria-labelledby="instagram-run-title" className="border-t border-white/10 pt-7">
        <h3 id="instagram-run-title" className="mb-1 text-lg font-bold">Esegui adesso</h3>
        <p className="mb-5 text-sm text-gray-400">Salva le modifiche prima di generare o pubblicare.</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => runStory(false)}
            disabled={busy !== null}
            className="inline-flex min-h-10 items-center gap-2 border border-white/20 px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            {busy === "preview" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ImageIcon className="h-4 w-4" aria-hidden="true" />}
            Genera anteprima
          </button>
          <button
            type="button"
            onClick={() => runStory(true)}
            disabled={busy !== null}
            className="btn btn-primary inline-flex items-center gap-2 disabled:opacity-50"
          >
            {busy === "publish" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            Pubblica ora su Instagram
          </button>
        </div>
        {previewUrl && (
          <a href={previewUrl} target="_blank" rel="noreferrer" className="mt-6 inline-block">
            <img src={previewUrl} alt="Anteprima story settimanale" className="w-56 border border-white/15" />
          </a>
        )}
      </section>

      {feedback && (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          className={`mb-0 inline-flex items-center gap-2 text-sm ${feedback.kind === "error" ? "text-red-300" : "text-emerald-300"}`}
        >
          {feedback.kind === "success" && <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          {feedback.text}
        </p>
      )}
    </div>
  );
}
