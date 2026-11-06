import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminAuth } from "@/lib/auth-helpers";

/**
 * GET /api/admin/cron-status?limit=50
 * Restituisce gli ultimi run; includeSourceRuns=1 carica tutti i run delle sorgenti e gli aggregati cron.
 */
export async function GET(request: NextRequest) {
  return withAdminAuth(async () => {
    const limit = Math.min(200, Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10)));
    const includeSourceRuns = request.nextUrl.searchParams.get("includeSourceRuns") === "1";
    try {
      const runs = await (prisma as any).cronJobRun.findMany({
        ...(includeSourceRuns ? {
          where: {
            OR: [
              { jobKey: { startsWith: "scrape-source:" } },
              { jobKey: "visitpedemontana" },
              { jobKey: "daily-dispatch" },
            ],
          },
        } : {}),
        orderBy: { startedAt: "desc" },
        ...(!includeSourceRuns ? { take: limit } : {}),
      });
      return NextResponse.json({ runs });
    } catch (error) {
      console.error("[cron-status GET] error:", error);
      return NextResponse.json({ error: "Failed to fetch cron status" }, { status: 500 });
    }
  });
}

/**
 * DELETE /api/admin/cron-status?jobKey=xxx
 * Marca manualmente un job come "stopped" (per il pulsante "Stop").
 */
export async function DELETE(request: NextRequest) {
  return withAdminAuth(async () => {
    const jobKey = request.nextUrl.searchParams.get("jobKey");
    if (!jobKey) {
      return NextResponse.json({ error: "jobKey required" }, { status: 400 });
    }
    try {
      await (prisma as any).cronJobRun.updateMany({
        where: { jobKey, status: "running" },
        data: { status: "stopped", finishedAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error("[cron-status DELETE] error:", error);
      return NextResponse.json({ error: "Failed to stop cron" }, { status: 500 });
    }
  });
}
