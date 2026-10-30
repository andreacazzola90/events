import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

// Vercel Hobby allows only daily cron jobs: this single entry point fans out
// to every scheduled job. Each job runs in its own function invocation (with
// its own maxDuration) and they run in parallel.
export const maxDuration = 300;

const DAILY_CRON_JOBS = [
  { key: "visitpedemontana", path: "/api/cron/scrape-visitpedemontana" },
  { key: "google-calendar", path: "/api/cron/sync-google-calendar" },
  { key: "instagram-story", path: "/api/cron/generate-instagram-story" },
] as const;

const JOB_TIMEOUT_MS = 295_000;

type JobResult = {
  key: string;
  ok: boolean;
  httpStatus?: number;
  data?: unknown;
  error?: string;
};

function isAuthorized(header: string | null, secrets: string[]): boolean {
  const received = Buffer.from(header || "");
  return secrets.some((secret) => {
    const expected = Buffer.from(`Bearer ${secret}`);
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

async function runJob(
  origin: string,
  job: (typeof DAILY_CRON_JOBS)[number],
  authorization: string,
): Promise<JobResult> {
  try {
    const response = await fetch(new URL(job.path, origin), {
      method: "GET",
      headers: { authorization },
      cache: "no-store",
      signal: AbortSignal.timeout(JOB_TIMEOUT_MS),
    });
    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 500) };
    }
    const status = (data as { status?: unknown } | null)?.status;
    const ok = response.ok && !["error", "partial-error", "failed"].includes(String(status));
    return { key: job.key, ok, httpStatus: response.status, data };
  } catch (error) {
    return { key: job.key, ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function GET(request: NextRequest) {
  const secrets = [process.env.CRON_SECRET, process.env.CRON_SECRET_KEY].filter(
    (value): value is string => Boolean(value),
  );
  if (!secrets.length) {
    return NextResponse.json({ error: "cron_secret_not_configured" }, { status: 503 });
  }
  const authorization = request.headers.get("authorization");
  if (!isAuthorized(authorization, secrets)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  const origin = request.nextUrl.origin;
  const jobs = await Promise.all(
    DAILY_CRON_JOBS.map((job) => runJob(origin, job, authorization!)),
  );
  const failed = jobs.filter((job) => !job.ok).map((job) => job.key);

  if (failed.length) {
    console.error("[Daily Cron] Failed jobs:", failed.join(", "));
  }

  return NextResponse.json({
    status: failed.length ? "partial-error" : "success",
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    failed,
    jobs,
  });
}
