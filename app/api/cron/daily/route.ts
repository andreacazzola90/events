import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CRON_JOBS } from "../../../../lib/cron-jobs";
import { runCronJob } from "../../../../lib/cron-dispatch";

// Vercel Hobby allows only daily cron jobs: this single entry point fans out
// to every scheduled job. Each job runs in its own function invocation (with
// its own maxDuration) and they run in parallel.
export const maxDuration = 300;

function isAuthorized(header: string | null, secrets: string[]): boolean {
  const received = Buffer.from(header || "");
  return secrets.some((secret) => {
    const expected = Buffer.from(`Bearer ${secret}`);
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

export async function GET(request: NextRequest) {
  const secrets = [process.env.CRON_SECRET_KEY].filter(
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
  try {
    await (prisma as any).cronJobRun.upsert({
      where: { jobKey: "daily-dispatch" },
      update: { status: "running", startedAt, finishedAt: null, resultJson: null },
      create: { jobKey: "daily-dispatch", status: "running", startedAt },
    });
  } catch (error) {
    console.warn("[Daily Cron] Failed recording dispatcher start:", error);
  }

  const origin = request.nextUrl.origin;
  const jobs = await Promise.all(
    CRON_JOBS.map((job) => runCronJob(origin, job, authorization!)),
  );
  const failed = jobs.filter((job) => !job.ok).map((job) => job.key);

  if (failed.length) {
    console.error("[Daily Cron] Failed jobs:", failed.join(", "));
  }

  const result = {
    status: failed.length ? "partial-error" : "success",
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    failed,
    jobs,
  };
  try {
    await (prisma as any).cronJobRun.updateMany({
      where: { jobKey: "daily-dispatch", startedAt },
      data: {
        status: failed.length ? "failed" : "completed",
        finishedAt: new Date(),
        resultJson: JSON.stringify(result),
      },
    });
  } catch (error) {
    console.warn("[Daily Cron] Failed recording dispatcher result:", error);
  }

  return NextResponse.json(result);
}
