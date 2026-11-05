import { CRON_JOBS, type CronJobResult } from "./cron-jobs";

const JOB_TIMEOUT_MS = 295_000;

export async function runCronJob(
  origin: string,
  job: (typeof CRON_JOBS)[number],
  authorization: string,
  manual = false,
): Promise<CronJobResult> {
  try {
    const url = new URL(job.path, origin);
    if (manual && job.key === "instagram-story") url.searchParams.set("force", "1");
    const response = await fetch(url, {
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
    const ok = response.ok && !["error", "partial", "partial-error", "failed"].includes(String(status));
    return { key: job.key, ok, httpStatus: response.status, data };
  } catch (error) {
    return { key: job.key, ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
