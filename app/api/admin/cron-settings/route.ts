import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/auth-helpers";
import { getCronJobSettings, saveCronJobSettings } from "../../../../lib/cron-job-settings";
import { CRON_JOBS, type CronJobKey } from "../../../../lib/cron-jobs";

function isCronJobKey(value: unknown): value is CronJobKey {
  return CRON_JOBS.some((job) => job.key === value);
}

export async function GET() {
  return withAdminAuth(async () => {
    try {
      return NextResponse.json({ jobs: await getCronJobSettings() });
    } catch (error) {
      console.error("[Cron Settings] Failed to read settings:", error);
      return NextResponse.json({ error: "Impossibile leggere le impostazioni dei cron" }, { status: 503 });
    }
  });
}

export async function PUT(request: NextRequest) {
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

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !("jobs" in body)
    ) {
      return NextResponse.json({ error: "Impostazioni dei cron non valide" }, { status: 400 });
    }

    const jobs: unknown = body.jobs;
    if (
      !Array.isArray(jobs) ||
      jobs.length > CRON_JOBS.length ||
      !jobs.every(isCronJobKey) ||
      new Set(jobs).size !== jobs.length
    ) {
      return NextResponse.json({ error: "Selezione dei cron non valida o con duplicati" }, { status: 400 });
    }

    try {
      const settings = await saveCronJobSettings(jobs);
      return NextResponse.json({ jobs: settings });
    } catch (error) {
      console.error("[Cron Settings] Failed to save settings:", error);
      return NextResponse.json({ error: "Impossibile salvare le impostazioni dei cron" }, { status: 503 });
    }
  });
}
