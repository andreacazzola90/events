import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/auth-helpers";
import { CRON_JOBS } from "../../../../lib/cron-jobs";
import { runCronJob } from "../../../../lib/cron-dispatch";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  return withAdminAuth(async () => {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Origine non consentita" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
    }
    const keys = body && typeof body === "object" && "jobs" in body ? body.jobs : undefined;
    if (
      !Array.isArray(keys) ||
      keys.length === 0 ||
      keys.length > CRON_JOBS.length ||
      keys.some((key) => !CRON_JOBS.some((job) => job.key === key)) ||
      new Set(keys).size !== keys.length
    ) {
      return NextResponse.json({ error: "Seleziona almeno un cron valido, senza duplicati" }, { status: 400 });
    }
    const secret = process.env.CRON_SECRET_KEY;
    if (!secret) {
      return NextResponse.json({ error: "cron_secret_not_configured" }, { status: 503 });
    }

    const jobs = await Promise.all(
      CRON_JOBS.filter((job) => keys.includes(job.key))
        .map((job) => runCronJob(request.nextUrl.origin, job, `Bearer ${secret}`, true)),
    );
    const failed = jobs.filter((job) => !job.ok).map((job) => job.key);
    if (failed.length) console.error("[Manual Cron] Failed jobs:", failed.join(", "));
    return NextResponse.json({
      status: failed.length ? "partial-error" : "success",
      jobs,
      failed,
    });
  });
}
