"use client";

import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { generateUniqueSlug } from "../../lib/slug-utils";
import type { DbEvent } from "../types/event";

type UserEvent = DbEvent;
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

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/auth");
    }
  }, [status, router]);

  useEffect(() => {
    if (session) {
      fetchUserEvents();
    }
  }, [session]);

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

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/");
  };

  const isAdmin =
    (session?.user as any)?.role === "admin" ||
    (session?.user as any)?.type === "admin" ||
    session?.user?.email === "andreacazzola90@gmail.com";

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <main className="min-h-screen account-page">
      <div className="max-w-6xl mx-auto px-6 pt-8">
        <div className="glass-effect p-6">
          <div className="flex flex-wrap gap-3" role="tablist" aria-label="Sezioni account">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "profile"}
              aria-controls="tab-panel-profile"
              onClick={() => setActiveTab("profile")}
              className={`btn ${activeTab === "profile" ? "btn-primary" : "btn-outline"}`}
            >
              Profilo
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "events"}
              aria-controls="tab-panel-events"
              onClick={() => setActiveTab("events")}
              className={`btn ${activeTab === "events" ? "btn-primary" : "btn-outline"}`}
            >
              I miei eventi
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "favorites"}
              aria-controls="tab-panel-favorites"
              onClick={() => setActiveTab("favorites")}
              className={`btn ${activeTab === "favorites" ? "btn-primary" : "btn-outline"}`}
            >
              Preferiti
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "stats"}
              aria-controls="tab-panel-stats"
              onClick={() => setActiveTab("stats")}
              className={`btn ${activeTab === "stats" ? "btn-primary" : "btn-outline"}`}
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
                className={`btn ${activeTab === "admin" ? "btn-primary" : "btn-outline"}`}
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
              className={`btn ${activeTab === "password" ? "btn-primary" : "btn-outline"}`}
            >
              Password
            </button>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      {activeTab === "profile" && (
      <section className="hero-section" id="tab-panel-profile" role="tabpanel" aria-labelledby="tab-panel-profile">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="glass-effect rounded-3xl p-8 md:p-12 animate-fadeInUp">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
              <div className="flex-1">
                <h1 className="text-5xl md:text-6xl font-black mb-6 leading-tight">
                  Your <span className="gradient-text">Profile</span>
                </h1>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-linear-to-br from-pink-500 to-purple-600 rounded-full flex items-center justify-center">
                      <span className="text-xl">👤</span>
                    </div>
                    <div>
                      <span className="text-gray-400 text-sm">Name</span>
                      <p className="text-white font-semibold text-lg">
                        {session.user?.name || "Not available"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-linear-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center">
                      <span className="text-xl">📧</span>
                    </div>
                    <div>
                      <span className="text-gray-400 text-sm">Email</span>
                      <p className="text-white font-semibold text-lg">
                        {session.user?.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-linear-to-br from-pink-600 to-purple-500 rounded-full flex items-center justify-center">
                      <span className="text-xl">🆔</span>
                    </div>
                    <div>
                      <span className="text-gray-400 text-sm">User ID</span>
                      <p className="text-white font-mono text-sm">
                        {(session.user as any)?.id || "N/A"}
                      </p>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-linear-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center">
                        <span className="text-xl">⭐</span>
                      </div>
                      <div>
                        <span className="text-gray-400 text-sm">Type</span>
                        <p className="text-emerald-300 font-semibold text-lg">
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
                  ✨ Create Event
                </button>
                <button
                  onClick={handleLogout}
                  className="btn btn-outline btn-secondary btn-lg inline-flex items-center gap-3 font-bold text-lg"
                >
                  🚪 Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
      )}

      <div className="max-w-6xl mx-auto px-6 pb-16 space-y-8">
        {activeTab === "password" && (
        <div id="tab-panel-password" role="tabpanel" className="glass-effect rounded-2xl p-8">
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
        <div id="tab-panel-events" role="tabpanel" className="glass-effect rounded-2xl p-8">
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {userEvents.map((event) => (
                <div
                  key={event.id}
                  className="card bg-base-100/5 border border-base-200/40 cursor-pointer group hover:border-primary/60 hover:shadow-xl transition-all duration-300"
                  onClick={() =>
                    router.push(
                      `/events/${generateUniqueSlug(event.title, event.id)}`,
                    )
                  }
                >
                  {/* Event Image */}
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
                        className="w-full h-40 object-cover transition-transform duration-300 group-hover:scale-110"
                        sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                      />
                    ) : (
                      <div className="w-full h-40 bg-linear-to-br from-pink-500/20 to-purple-600/20 flex items-center justify-center">
                        <div className="text-4xl opacity-50">🎵</div>
                      </div>
                    )}

                    {/* Owner Badge */}
                    <div className="badge badge-success absolute top-3 right-3 text-xs font-semibold">
                      YOURS
                    </div>
                  </div>

                  {/* Event Details */}
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

                    {/* Action Button */}
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
          )}
        </div>
        )}

        {/* Favorite Events Section */}
        {activeTab === "favorites" && (
        <div id="tab-panel-favorites" role="tabpanel" className="glass-effect rounded-2xl p-8">
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
                  className="card bg-base-100/5 border border-base-200/40 cursor-pointer group hover:border-pink-500/60 hover:shadow-xl transition-all duration-300"
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
                        className="w-full h-40 object-cover transition-transform duration-300 group-hover:scale-110"
                        sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                      />
                    ) : (
                      <div className="w-full h-40 bg-linear-to-br from-pink-500/20 to-purple-600/20 flex items-center justify-center">
                        <div className="text-4xl opacity-50">🎵</div>
                      </div>
                    )}

                    <div className="badge badge-error absolute top-3 right-3 text-xs font-semibold">
                      FAV
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
        <div id="tab-panel-stats" role="tabpanel" className="glass-effect rounded-2xl p-8">
          <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
            <span className="text-2xl">📊</span>
            Your Stats
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-linear-to-br from-pink-500 to-purple-600 rounded-2xl p-6 text-white relative overflow-hidden">
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

            <div className="bg-linear-to-br from-purple-500 to-pink-600 rounded-2xl p-6 text-white relative overflow-hidden">
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

            <div className="bg-linear-to-br from-pink-600 to-purple-500 rounded-2xl p-6 text-white relative overflow-hidden">
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
          <div id="tab-panel-admin" role="tabpanel" className="glass-effect rounded-2xl p-8">
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
