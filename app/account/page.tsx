"use client";

import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Link2, LoaderCircle, Unlink } from "lucide-react";
import { toast } from "react-toastify";
import { generateUniqueSlug } from "../../lib/slug-utils";
import { groupEventsByScanOriginAndDate } from "../../lib/event-scan-groups";
import type { DbEvent } from "../types/event";

type UserEvent = Omit<DbEvent, "createdAt"> & {
  createdAt: Date | string;
};
type GoogleCalendarOption = { id: string; summary: string; backgroundColor: string; primary: boolean };
type AccountTab =
  | "profile"
  | "password"
  | "events"
  | "favorites"
  | "stats"
  | "admin";

export default function AccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [userEvents, setUserEvents] = useState<UserEvent[]>([]);
  const [favoriteEvents, setFavoriteEvents] = useState<UserEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [instagramStoryResult, setInstagramStoryResult] = useState<any | null>(
    null,
  );
  const [visitpedemontanaResult, setVisitpedemontanaResult] = useState<
    any | null
  >(null);
  const [runningCron, setRunningCron] = useState<
    "instagram-story" | "visitpedemontana" | null
  >(null);
  const [stoppingCron, setStoppingCron] = useState<
    "instagram-story" | "visitpedemontana" | null
  >(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<AccountTab>("profile");
  const [calendarDeliveryError, setCalendarDeliveryError] = useState<string | null>(null);
  const [googleCalendarEmail, setGoogleCalendarEmail] = useState<string | null>(null);
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendarOption[]>([]);
  const [selectedGoogleCalendarId, setSelectedGoogleCalendarId] = useState("");
  const [googleCalendarListLoading, setGoogleCalendarListLoading] = useState(false);
  const [googleCalendarListError, setGoogleCalendarListError] = useState<string | null>(null);
  const [googleCalendarConfigured, setGoogleCalendarConfigured] = useState(false);
  const [googleCalendarBusy, setGoogleCalendarBusy] = useState(false);
  const [savingGoogleCalendar, setSavingGoogleCalendar] = useState(false);
  const [calendarSettingsLoaded, setCalendarSettingsLoaded] = useState(false);

  useEffect(() => {
    if (!session) return;
    fetch("/api/account/calendar-email")
      .then((res) => {
        if (!res.ok) throw new Error("load failed");
        return res.json();
      })
      .then((data) => {
        setCalendarDeliveryError(data?.calendarDeliveries?.[0]?.lastError || null);
        setGoogleCalendarEmail(data?.googleCalendar?.email || null);
        setGoogleCalendarConfigured(Boolean(data?.googleCalendarConfigured));
        setCalendarSettingsLoaded(true);
        if (data?.googleCalendar?.email) {
          setGoogleCalendarListLoading(true);
          fetch("/api/account/google-calendar/calendars")
            .then(async response => {
              const payload = await response.json().catch(() => ({}));
              if (!response.ok) throw new Error(payload.error || "google_calendar_unavailable");
              return payload;
            })
            .then(payload => {
              setGoogleCalendars(payload.calendars || []);
              setSelectedGoogleCalendarId(payload.selectedCalendarId || "");
              setGoogleCalendarListError(null);
            })
            .catch(error => {
              setGoogleCalendarListError(error instanceof Error ? error.message : "google_calendar_unavailable");
            })
            .finally(() => setGoogleCalendarListLoading(false));
        } else {
          setGoogleCalendars([]);
          setSelectedGoogleCalendarId("");
          setGoogleCalendarListError(null);
        }
      })
      .catch(() => toast.error("Impossibile caricare le preferenze Google Calendar"));
  }, [session]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("googleCalendar");
    if (!result) return;
    if (result === "connected") toast.success("Google Calendar collegato");
    else if (result === "denied") toast.info("Collegamento Google annullato");
    else if (result === "missing_scope") toast.error("Autorizzazione al calendario non concessa");
    else toast.error("Collegamento Google non riuscito. Riprova.");
    url.searchParams.delete("googleCalendar");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const handleGoogleCalendarChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextCalendarId = event.target.value;
    const previousCalendarId = selectedGoogleCalendarId;
    setSelectedGoogleCalendarId(nextCalendarId);
    setSavingGoogleCalendar(true);
    setGoogleCalendarListError(null);
    try {
      const response = await fetch("/api/account/google-calendar/calendars", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId: nextCalendarId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Impossibile salvare il calendario Google");
      setSelectedGoogleCalendarId(payload.selectedCalendarId);
      setCalendarDeliveryError(null);
    } catch (error) {
      setSelectedGoogleCalendarId(previousCalendarId);
      setGoogleCalendarListError(error instanceof Error ? error.message : "google_calendar_unavailable");
      toast.error(error instanceof Error ? error.message : "Problema di connessione, riprova.");
    } finally {
      setSavingGoogleCalendar(false);
    }
  };

  const handleConnectGoogleCalendar = async () => {
    setGoogleCalendarBusy(true);
    try {
      const response = await fetch("/api/account/google-calendar", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Collegamento Google non riuscito");
      window.location.assign(payload.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Problema di connessione, riprova.");
    } finally {
      setGoogleCalendarBusy(false);
    }
  };

  const handleDisconnectGoogleCalendar = async () => {
    setGoogleCalendarBusy(true);
    try {
      const response = await fetch("/api/account/google-calendar", { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Impossibile scollegare Google Calendar");
      setGoogleCalendarEmail(null);
      toast.success("Google Calendar scollegato");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Problema di connessione, riprova.");
    } finally {
      setGoogleCalendarBusy(false);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/auth");
    }
  }, [status, router]);

  const fetchUserEvents = async () => {
    try {
      const userData = session?.user as any;
      const userId = userData?.id;
      const userEmail = (userData?.email || '').toLowerCase();
      const adminView =
        userData?.role === 'admin' ||
        userData?.type === 'admin' ||
        userEmail === 'andreacazzola90@gmail.com' ||
        userEmail.startsWith('andreacazzola90@');

      const eventsUrl = adminView
        ? '/api/events?limit=200&includePast=true'
        : '/api/events?userId=' + userId + '&includePast=true';

      const [eventsRes, favoritesRes] = await Promise.all([
        fetch(eventsUrl),
        fetch('/api/favorites'),
      ]);

      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setUserEvents(data);
      }

      if (favoritesRes.ok) {
        const favData = await favoritesRes.json();
        setFavoriteEvents(favData);
      }
    } catch (error) {
      console.error("Error fetching user events:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session) {
      fetchUserEvents();
    }
  }, [session]);

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/");
  };

  const isAdmin =
    (session?.user as any)?.role === "admin" ||
    (session?.user as any)?.type === "admin" ||
    session?.user?.email === "andreacazzola90@gmail.com";
  const isAdminEventsView =
    isAdmin ||
    (session?.user?.email ?? "")
      .toLowerCase()
      .startsWith("andreacazzola90@");
  const scanOriginGroups = groupEventsByScanOriginAndDate(
    userEvents,
    isAdminEventsView,
  );

  useEffect(() => {
    if (!isAdmin && activeTab === "admin") {
      setActiveTab("profile");
    }
  }, [isAdmin, activeTab]);

  // Recupera lo stato dei cron dal DB al mount (persiste dopo refresh)
  useEffect(() => {
    if (!isAdmin) return;
    const checkStatus = async () => {
      try {
        const res = await fetch("/api/admin/cron-status");
        if (!res.ok) return;
        const { runs } = await res.json();
        const running = (runs as any[]).find((r) => r.status === "running");
        if (running) {
          setRunningCron(running.jobKey as "instagram-story" | "visitpedemontana");
        } else {
          // Carica l'ultimo risultato disponibile per ciascun tipo
          for (const run of runs as any[]) {
            if (run.status === "completed" || run.status === "failed") {
              const result = run.resultJson ? JSON.parse(run.resultJson) : null;
              if (run.jobKey === "visitpedemontana" && result) {
                setVisitpedemontanaResult(result);
              } else if (run.jobKey === "instagram-story" && result) {
                setInstagramStoryResult(result);
              }
            }
          }
        }
      } catch { /* ignora */ }
    };
    checkStatus();
  }, [isAdmin]);

  // Polling: mentre un cron è in esecuzione controlla ogni 5s se è terminato
  useEffect(() => {
    if (!runningCron) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/admin/cron-status");
        if (!res.ok) return;
        const { runs } = await res.json();
        const run = (runs as any[]).find((r) => r.jobKey === runningCron);
        if (!run || run.status !== "running") {
          // Job terminato
          const result = run?.resultJson ? JSON.parse(run.resultJson) : null;
          if (runningCron === "visitpedemontana" && result) {
            setVisitpedemontanaResult(result);
            const duplicates = (result?.duplicates as any[]) || [];
            if (duplicates.length > 0) {
              toast.info(`${duplicates.length} eventi erano già presenti e non sono stati ricreati.`);
            }
          } else if (runningCron === "instagram-story" && result) {
            setInstagramStoryResult(result);
          }
          setRunningCron(null);
        }
      } catch { /* ignora */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [runningCron]);

  const runCron = async (type: "instagram-story" | "visitpedemontana") => {
    setRunningCron(type);
    // Fire-and-forget: il polling rileverà il completamento anche dopo un refresh
    fetch("/api/admin/run-cron/instagram-story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: type }),
    }).catch(() => { /* il polling gestirà lo stato finale */ });
  };

  const stopCron = async (type: "instagram-story" | "visitpedemontana") => {
    setStoppingCron(type);
    try {
      await fetch(`/api/admin/cron-status?jobKey=${type}`, { method: "DELETE" });
      setRunningCron(null);
    } catch { /* ignora */ } finally {
      setStoppingCron(null);
    }
  };

  const handlePasswordRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setPasswordMessage({
        type: "error",
        text: "Compila tutti i campi password.",
      });
      return;
    }

    if (newPassword.length < 8) {
      setPasswordMessage({
        type: "error",
        text: "La nuova password deve contenere almeno 8 caratteri.",
      });
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordMessage({
        type: "error",
        text: "La conferma password non coincide.",
      });
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPasswordMessage({
          type: "error",
          text: payload?.error || "Errore durante il recupero password.",
        });
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordMessage({
        type: "success",
        text: "Password aggiornata con successo.",
      });
    } catch (err) {
      setPasswordMessage({
        type: "error",
        text: (err as Error).message || "Errore durante il recupero password.",
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const renderCronResult = (result: any) => {
    if (!result) {
      return <div className="text-gray-400 text-xs">No run yet.</div>;
    }

    const payload = (result as any).data ?? result;
    const status = (payload as any)?.status ?? "n/a";
    const found = (payload as any)?.found ?? "n/a";
    const created = (payload as any)?.processed ?? "n/a";
    const newlyFound = (payload as any)?.new ?? "n/a";
    const events = ((payload as any)?.events as any[]) || [];
    const errors = ((payload as any)?.errors as any[]) || [];
    const latestImageUrl = (payload as any)?.latestImageUrl as
      | string
      | undefined;
    const archiveImageUrl = (payload as any)?.archiveImageUrl as
      | string
      | undefined;

    return (
      <div className="space-y-3 text-xs text-gray-200">
        <div className="text-[11px] text-gray-300">
          Status: <span className="font-semibold">{String(status)}</span> •
          Found: {String(found)} • New: {String(newlyFound)} • Saved:{" "}
          {String(created)}
        </div>

        {(latestImageUrl || archiveImageUrl) && (
          <div className="text-[11px] space-y-1">
            {latestImageUrl && (
              <div>
                <a
                  href={latestImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-300 hover:text-emerald-200 underline"
                >
                  Apri story settimanale (latest)
                </a>
              </div>
            )}
            {archiveImageUrl && (
              <div>
                <a
                  href={archiveImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-300 hover:text-cyan-200 underline"
                >
                  Apri immagine archivio
                </a>
              </div>
            )}
          </div>
        )}

        {events.length > 0 ? (
          <div className="space-y-2 max-h-56 overflow-auto pr-1">
            {events.map((ev: any, idx: number) => (
              <div
                key={ev.id ?? idx}
                className="border border-white/10 rounded-lg p-2 bg-white/5 text-[11px]"
              >
                <div className="font-semibold text-white line-clamp-2">
                  {ev.title || "Senza titolo"}
                </div>
                <div className="text-gray-300 mt-0.5">
                  {ev.date || "Data non disponibile"}
                  {ev.time ? ` • ${ev.time}` : ""}
                </div>
                {ev.location && (
                  <div className="text-gray-400 mt-0.5 truncate">
                    📍 {ev.location}
                  </div>
                )}
                {ev.sourceUrl && (
                  <a
                    href={ev.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-pink-300 hover:text-pink-200 underline mt-1 inline-block"
                  >
                    Apri sorgente
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-gray-400">
            Nessun evento creato in questo run.
          </div>
        )}

        {errors.length > 0 && (
          <details className="text-[11px] text-red-300">
            <summary className="cursor-pointer">
              Errori ({errors.length})
            </summary>
            <pre className="mt-1 whitespace-pre-wrap">
              {JSON.stringify(errors, null, 2)}
            </pre>
          </details>
        )}

        <details className="text-[11px] text-gray-500">
          <summary className="cursor-pointer">Mostra JSON completo</summary>
          <pre className="mt-1 bg-black/40 p-2 rounded-lg overflow-auto max-h-40">
            {JSON.stringify(result, null, 2)}
          </pre>
        </details>
      </div>
    );
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-2xl">
        Caricamento...
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <main className="min-h-screen page-shell account-page">
      <div className="editorial-container mb-8">
        <div className="account-tabs-shell surface-panel p-3 md:p-4">
          <div className="flex flex-wrap gap-3" role="tablist" aria-label="Sezioni account">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "profile"}
              aria-controls="tab-panel-profile"
              onClick={() => setActiveTab("profile")}
              className={`account-tab ${activeTab === "profile" ? "account-tab-active" : ""}`}
            >
              Profilo
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "events"}
              aria-controls="tab-panel-events"
              onClick={() => setActiveTab("events")}
              className={`account-tab ${activeTab === "events" ? "account-tab-active" : ""}`}
            >
              I miei eventi
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "favorites"}
              aria-controls="tab-panel-favorites"
              onClick={() => setActiveTab("favorites")}
              className={`account-tab ${activeTab === "favorites" ? "account-tab-active" : ""}`}
            >
              Preferiti
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "stats"}
              aria-controls="tab-panel-stats"
              onClick={() => setActiveTab("stats")}
              className={`account-tab ${activeTab === "stats" ? "account-tab-active" : ""}`}
            >
              Statistiche
            </button>
            {isAdmin && (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "admin"}
                aria-controls="tab-panel-admin"
                onClick={() => setActiveTab("admin")}
                className={`account-tab ${activeTab === "admin" ? "account-tab-active" : ""}`}
              >
                Admin tools
              </button>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "password"}
              aria-controls="tab-panel-password"
              onClick={() => setActiveTab("password")}
              className={`account-tab ${activeTab === "password" ? "account-tab-active" : ""}`}
            >
              Password
            </button>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      {activeTab === "profile" && (
      <section className="account-profile-section" id="tab-panel-profile" role="tabpanel" aria-labelledby="tab-panel-profile">
        <div className="editorial-container py-4 md:py-8">
          <div className="account-profile-card surface-panel p-6 md:p-10 animate-fadeInUp">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
              <div className="flex-1">
                <p className="section-kicker mb-3">Area personale</p>
                <h1 className="section-title mb-8">
                  Il tuo <span className="site-brand-accent">profilo.</span>
                </h1>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="account-profile-icon w-10 h-10 flex items-center justify-center">
                      <span className="text-xl">👤</span>
                    </div>
                    <div>
                      <span className="text-gray-400 text-sm">Nome</span>
                      <p className="text-white font-semibold text-lg mb-0">
                        {session.user?.name || "Non disponibile"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="account-profile-icon w-10 h-10 flex items-center justify-center">
                      <span className="text-xl">📧</span>
                    </div>
                    <div>
                      <span className="text-gray-400 text-sm">Email</span>
                      <p className="text-white font-semibold text-lg mb-0">
                        {session.user?.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="account-profile-icon w-10 h-10 flex items-center justify-center">
                      <span className="text-xl">🆔</span>
                    </div>
                    <div>
                      <span className="text-gray-400 text-sm">ID utente</span>
                      <p className="text-white font-mono text-sm">
                        {(session.user as any)?.id || "N/A"}
                      </p>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-3">
                      <div className="account-profile-icon w-10 h-10 flex items-center justify-center">
                        <span className="text-xl">⭐</span>
                      </div>
                      <div>
                        <span className="text-gray-400 text-sm">Tipo account</span>
                        <p className="text-emerald-300 font-semibold text-lg mb-0">
                          admin
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <button
                  onClick={() => router.push("/crea")}
                  className="btn btn-primary btn-lg inline-flex items-center gap-3 font-bold text-lg"
                >
                  ✨ Crea evento
                </button>
                <button
                  onClick={handleLogout}
                  className="btn btn-outline btn-secondary btn-lg inline-flex items-center gap-3 font-bold text-lg"
                >
                  🚪 Esci
                </button>
              </div>
            </div>

            <div className="account-calendar-email mt-10 border-t border-white/20 pt-8 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-white/10 pt-5 !mt-5">
                <div className="min-w-0">
                  <h3 className="text-white font-semibold text-base">Google Calendar</h3>
                  <p className="text-sm text-gray-400 break-all" role="status">
                    {!calendarSettingsLoaded ? "Caricamento..." : googleCalendarEmail
                      ? `${googleCalendarEmail} · Collegato`
                      : googleCalendarConfigured ? "Non collegato" : "Configurazione Google non disponibile"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={googleCalendarEmail ? handleDisconnectGoogleCalendar : handleConnectGoogleCalendar}
                  disabled={!calendarSettingsLoaded || googleCalendarBusy || savingGoogleCalendar || (!googleCalendarEmail && !googleCalendarConfigured)}
                  className="btn btn-outline inline-flex items-center justify-center gap-2 shrink-0 text-white"
                >
                  {googleCalendarBusy ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
                    : googleCalendarEmail ? <Unlink size={18} aria-hidden="true" /> : <Link2 size={18} aria-hidden="true" />}
                  {googleCalendarBusy ? "Attendi..." : googleCalendarEmail ? "Scollega" : "Collega Google Calendar"}
                </button>
              </div>
              {googleCalendarEmail && (
                <div className="max-w-md space-y-2 pt-3">
                  <label htmlFor="calendar-event-type" className="block text-white font-semibold text-sm">Tipo di evento Google Calendar</label>
                  <div className="flex items-center gap-3">
                    {googleCalendars.find(calendar => calendar.id === selectedGoogleCalendarId) && (
                      <span
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 rounded-full border border-white/50"
                        style={{ backgroundColor: googleCalendars.find(calendar => calendar.id === selectedGoogleCalendarId)?.backgroundColor }}
                      />
                    )}
                    <select
                      id="calendar-event-type"
                      value={selectedGoogleCalendarId}
                      onChange={handleGoogleCalendarChange}
                      disabled={googleCalendarListLoading || savingGoogleCalendar || googleCalendarBusy || googleCalendars.length === 0}
                      className="account-input min-w-0 flex-1 border border-white/20 px-4 py-3 text-white text-sm bg-transparent"
                    >
                      {googleCalendars.map(calendar => (
                        <option key={calendar.id} value={calendar.id}>
                          {calendar.summary}{calendar.primary ? " (principale)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  {googleCalendarListError && (
                    <div className="space-y-2" role="status">
                      <p className="text-sm text-red-400">
                        {googleCalendarListError === "google_calendar_reconnect_required"
                          ? "Ricollega Google Calendar per autorizzare l’elenco dei calendari."
                          : googleCalendarListError === "google_calendar_schema_update_required"
                            ? "Aggiornamento database necessario per scegliere il calendario Google."
                          : "Impossibile caricare o salvare i calendari Google. Riprova."}
                      </p>
                      {googleCalendarListError === "google_calendar_reconnect_required" && (
                        <button type="button" onClick={handleConnectGoogleCalendar} disabled={googleCalendarBusy} className="btn btn-outline text-white">
                          Ricollega Google Calendar
                        </button>
                      )}
                    </div>
                  )}
                  {!googleCalendarListLoading && !googleCalendarListError && googleCalendars.length === 0 && (
                    <p className="text-sm text-gray-400" role="status">Nessun calendario Google scrivibile trovato.</p>
                  )}
                  {googleCalendarListLoading && <p className="text-sm text-gray-400" role="status">Caricamento calendari...</p>}
                  {savingGoogleCalendar && <p className="text-sm text-gray-400" role="status">Salvataggio calendario...</p>}
                </div>
              )}
              {calendarDeliveryError && (
                <p className="text-sm text-red-500" role="status">
                  {calendarDeliveryError === "google_reconnect_required" ? "Autorizzazione Google scaduta"
                    : calendarDeliveryError === "google_event_time_required" ? "Il tipo selezionato richiede un evento con orario"
                    : ["google_http_400", "google_http_403", "google_event_type_invalid"].includes(calendarDeliveryError)
                      ? "Google ha rifiutato il tipo di evento o i permessi del calendario"
                      : "Sincronizzazione in attesa di un nuovo tentativo"}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
      )}

      <div className="editorial-container pb-12 space-y-8">
        {activeTab === "password" && (
        <div id="tab-panel-password" role="tabpanel" className="account-content-panel surface-panel p-5 md:p-8">
          <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
            <span className="text-2xl">🔐</span>
            Recupera Password
          </h2>
          <p className="text-gray-300 mb-6">
            Per sicurezza inserisci la password attuale e imposta una nuova password.
          </p>

          <form
            onSubmit={handlePasswordRecovery}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm text-gray-300">Password attuale</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-white placeholder:text-gray-400"
                placeholder="Inserisci password attuale"
                autoComplete="current-password"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-gray-300">Nuova password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-white placeholder:text-gray-400"
                placeholder="Almeno 8 caratteri"
                autoComplete="new-password"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-gray-300">Conferma nuova password</span>
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className="w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-white placeholder:text-gray-400"
                placeholder="Ripeti nuova password"
                autoComplete="new-password"
              />
            </label>

            <div className="md:col-span-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={changingPassword}
                className="btn btn-primary"
              >
                {changingPassword ? "Aggiornamento..." : "Aggiorna password"}
              </button>
            </div>

            {passwordMessage && (
              <div
                className={`md:col-span-2 rounded-xl px-4 py-3 text-sm ${
                  passwordMessage.type === "success"
                    ? "bg-emerald-500/20 text-emerald-200 border border-emerald-500/40"
                    : "bg-red-500/20 text-red-200 border border-red-500/40"
                }`}
              >
                {passwordMessage.text}
              </div>
            )}
          </form>
        </div>
        )}

        {/* Your Events Section */}
        {activeTab === "events" && (
        <div id="tab-panel-events" role="tabpanel" className="account-content-panel surface-panel p-5 md:p-8">
          <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
            <span className="text-2xl">🎵</span>
            {isAdmin ? 'All Events (Admin)' : 'Your Events'}
          </h2>
          {userEvents.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">🎭</div>
              <h3 className="text-2xl font-bold text-white mb-2">
                No events yet
              </h3>
              <p className="text-gray-400 mb-6">
                Start creating your first event and share it with the world
              </p>
              <button
                onClick={() => router.push("/crea")}
                className="btn btn-primary inline-flex items-center gap-3"
              >
                ✨ Create Your First Event
              </button>
            </div>
          ) : (
            <div className="space-y-10">
              {scanOriginGroups.map((originGroup) => (
                <section key={originGroup.origin} className="space-y-6">
                  <h3 className="text-2xl font-bold text-white">
                    {originGroup.label}
                  </h3>
                  {originGroup.days.map((dayGroup) => (
                    <div key={`${originGroup.origin}-${dayGroup.key ?? "invalid"}`} className="space-y-4">
                      <h4 className="text-lg font-semibold text-gray-200">
                        {dayGroup.label}
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {dayGroup.events.map((event) => (
                          <div
                            key={event.id}
                            className="account-event-card cursor-pointer group transition-all duration-300"
                            onClick={() =>
                              router.push(
                                `/events/${generateUniqueSlug(event.title, event.id)}`,
                              )
                            }
                          >
                            <div className="relative overflow-hidden">
                              {event.imageUrl ? (
                                <Image
                                  src={event.imageUrl}
                                  alt={event.title}
                                  width={600}
                                  height={400}
                                  className="account-event-image w-full h-40 object-cover transition-transform duration-500 group-hover:scale-105"
                                  sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                                />
                              ) : (
                                <div className="account-event-placeholder w-full h-40 flex items-center justify-center">
                                  <div className="text-4xl opacity-50">🎵</div>
                                </div>
                              )}

                              <div className="account-event-origin absolute top-3 right-3 text-xs font-semibold">
                                {event.origin === "user"
                                  ? isAdminEventsView ? "UTENTE" : "TU"
                                  : "CRON"}
                              </div>
                            </div>

                            <div className="p-5 space-y-3">
                              <h3 className="text-xl font-bold text-white leading-tight line-clamp-2 group-hover:text-pink-400 transition-colors">
                                {event.title}
                              </h3>
                              <p className="text-gray-400 text-sm line-clamp-2">
                                {event.description}
                              </p>

                              <div className="space-y-1 text-sm text-gray-300">
                                <div className="flex items-center gap-2">
                                  <span>📅</span>
                                  <span>
                                    {event.date} • {event.time}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 line-clamp-1">
                                  <span>📍</span>
                                  <span className="truncate">{event.location}</span>
                                </div>
                                {event.category && (
                                  <div className="flex items-center gap-2">
                                    <span>🏷️</span>
                                    <span>{event.category}</span>
                                  </div>
                                )}
                              </div>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(
                                    `/events/${generateUniqueSlug(event.title, event.id)}/edit`,
                                  );
                                }}
                                className="btn btn-outline btn-primary w-full mt-4"
                              >
                                ✏️ Edit Event
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Favorite Events Section */}
        {activeTab === "favorites" && (
        <div id="tab-panel-favorites" role="tabpanel" className="account-content-panel surface-panel p-5 md:p-8">
          <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
            <span className="text-2xl">❤️</span>
            Favorite Events
          </h2>
          {favoriteEvents.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              Nessun evento tra i preferiti al momento.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {favoriteEvents.map((event) => (
                <div
                  key={event.id}
                  className="account-event-card cursor-pointer group transition-all duration-300"
                  onClick={() =>
                    router.push(
                      `/events/${generateUniqueSlug(event.title, event.id)}`,
                    )
                  }
                >
                  <div className="relative overflow-hidden">
                    {event.imageUrl ? (
                      <Image
                        src={
                          event.imageUrl.startsWith("/uploads/")
                            ? event.imageUrl
                            : event.imageUrl
                        }
                        alt={event.title}
                        width={600}
                        height={400}
                        className="account-event-image w-full h-40 object-cover transition-transform duration-500 group-hover:scale-105"
                        sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                      />
                    ) : (
                      <div className="account-event-placeholder w-full h-40 flex items-center justify-center">
                        <div className="text-4xl opacity-50">🎵</div>
                      </div>
                    )}

                    <div className="account-event-origin absolute top-3 right-3 text-xs font-semibold">
                      PREFERITO
                    </div>
                  </div>

                  <div className="p-5 space-y-3">
                    <h3 className="text-xl font-bold text-white leading-tight line-clamp-2 group-hover:text-pink-400 transition-colors">
                      {event.title}
                    </h3>
                    <p className="text-gray-400 text-sm line-clamp-2">
                      {event.description}
                    </p>

                    <div className="space-y-1 text-sm text-gray-300">
                      <div className="flex items-center gap-2">
                        <span>📅</span>
                        <span>
                          {event.date} • {event.time}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 line-clamp-1">
                        <span>📍</span>
                        <span className="truncate">{event.location}</span>
                      </div>
                      {event.category && (
                        <div className="flex items-center gap-2">
                          <span>🏷️</span>
                          <span>{event.category}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Statistics Section */}
        {activeTab === "stats" && (
        <div id="tab-panel-stats" role="tabpanel" className="account-content-panel surface-panel p-5 md:p-8">
          <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
            <span className="text-2xl">📊</span>
            Your Stats
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="account-stat-card p-6 relative overflow-hidden">
              <div className="relative z-10">
                <div className="text-4xl font-black mb-2">
                  {userEvents.length}
                </div>
                <div className="text-lg font-semibold opacity-90">
                  Events Created
                </div>
              </div>
              <div className="absolute -top-4 -right-4 text-6xl opacity-20">
                🎵
              </div>
            </div>

            <div className="account-stat-card p-6 relative overflow-hidden">
              <div className="relative z-10">
                <div className="text-4xl font-black mb-2">
                  {
                    userEvents.filter((e) => new Date(e.date) >= new Date())
                      .length
                  }
                </div>
                <div className="text-lg font-semibold opacity-90">
                  Upcoming Events
                </div>
              </div>
              <div className="absolute -top-4 -right-4 text-6xl opacity-20">
                🚀
              </div>
            </div>

            <div className="account-stat-card p-6 relative overflow-hidden">
              <div className="relative z-10">
                <div className="text-4xl font-black mb-2">
                  {new Set(userEvents.map((e) => e.category)).size}
                </div>
                <div className="text-lg font-semibold opacity-90">
                  Categories
                </div>
              </div>
              <div className="absolute -top-4 -right-4 text-6xl opacity-20">
                🏷️
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Admin Cron Controls */}
        {isAdmin && activeTab === "admin" && (
          <div id="tab-panel-admin" role="tabpanel" className="account-content-panel surface-panel p-5 md:p-8">
            <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
              <span className="text-2xl">🛠️</span>
              <span>Admin Tools</span>
            </h2>
            <div className="space-y-6">
              <div className="flex flex-wrap gap-4">
                <a href="/cron" className="btn btn-ghost inline-flex items-center gap-2">
                  Gestione Cron
                </a>
                <a href="/admin" className="btn btn-ghost inline-flex items-center gap-2">
                  📋 Log &amp; Cronologia
                </a>
                <button
                  onClick={() => runCron("instagram-story")}
                  className="btn btn-accent inline-flex items-center gap-2"
                  disabled={runningCron !== null}
                >
                  {runningCron === "instagram-story"
                    ? "Generating Instagram Story…"
                    : "Generate Instagram Story Now"}
                </button>
                {runningCron === "instagram-story" && (
                  <button
                    onClick={() => stopCron("instagram-story")}
                    className="btn btn-error btn-sm inline-flex items-center gap-2"
                    disabled={stoppingCron === "instagram-story"}
                  >
                    {stoppingCron === "instagram-story" ? "Stopping…" : "Stop"}
                  </button>
                )}
                <button
                  onClick={() => runCron("visitpedemontana")}
                  className="btn btn-secondary inline-flex items-center gap-2"
                  disabled={runningCron !== null}
                >
                  {runningCron === "visitpedemontana"
                    ? "Running VisitPedemontana Cron…"
                    : "Run VisitPedemontana Cron Now"}
                </button>
                {runningCron === "visitpedemontana" && (
                  <button
                    onClick={() => stopCron("visitpedemontana")}
                    className="btn btn-error btn-sm inline-flex items-center gap-2"
                    disabled={stoppingCron === "visitpedemontana"}
                  >
                    {stoppingCron === "visitpedemontana" ? "Stopping…" : "Stop"}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h3 className="font-semibold text-white mb-2">
                    Instagram Story Result
                  </h3>
                  {renderCronResult(instagramStoryResult)}
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-2">
                    VisitPedemontana Result
                  </h3>
                  {renderCronResult(visitpedemontanaResult)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
