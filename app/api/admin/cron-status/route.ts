import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminAuth } from "@/lib/auth-helpers";

/**
 * GET /api/admin/cron-status
 * Restituisce tutti i job in stato "running" o l'ultimo completato per ciascun jobKey.
 */
export async function GET(request: NextRequest) {
  return withAdminAuth(async () => {
    try {
      const runs = await (prisma as any).cronJobRun.findMany({
        orderBy: { startedAt: "desc" },
        take: 20,
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
