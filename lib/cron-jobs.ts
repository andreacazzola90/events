export const CRON_JOBS = [
  { key: "visitpedemontana", label: "Sorgenti web e coda Telegram", path: "/api/cron/scrape-visitpedemontana" },
  { key: "google-calendar", label: "Sincronizzazione Google Calendar", path: "/api/cron/sync-google-calendar" },
  { key: "instagram-story", label: "Story Instagram", path: "/api/cron/generate-instagram-story" },
  { key: "instagram-scan", label: "Scansione Instagram", path: "/api/cron/scan-instagram" },
  { key: "crop-learning-cleanup", label: "Pulizia dati crop", path: "/api/cron/cleanup-crop-learning" },
] as const;

export type CronJobKey = (typeof CRON_JOBS)[number]["key"];

export type CronJobResult = {
  key: CronJobKey;
  ok: boolean;
  httpStatus?: number;
  data?: unknown;
  error?: string;
};
