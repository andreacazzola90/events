import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  return withAdminAuth(async () => {
    try {
      let target: "instagram-story" | "visitpedemontana" = "instagram-story";
      let dryRun = false;
      try {
        const body = await request.json();
        if (body?.target === "visitpedemontana") {
          target = "visitpedemontana";
        }
        if (body?.dryRun === true) {
          dryRun = true;
        }
      } catch {
        // Body opzionale: default instagram-story
      }

      // Marca il job come "running" nel DB così la UI può rilevarlo dopo un refresh
      await (prisma as any).cronJobRun.upsert({
        where: { jobKey: target },
        update: { status: "running", startedAt: new Date(), finishedAt: null, resultJson: null },
        create: { jobKey: target, status: "running" },
      });

      const headers: HeadersInit = {};
      if (process.env.CRON_SECRET) {
        headers["authorization"] = `Bearer ${process.env.CRON_SECRET}`;
      }

      const targetPath =
        target === "visitpedemontana"
          ? "/api/cron/scrape-visitpedemontana"
          : "/api/cron/generate-instagram-story";
      const targetUrl = new URL(targetPath, request.url);
      if (dryRun && target === "visitpedemontana") {
        targetUrl.searchParams.set("dryRun", "1");
      }

      let jobStatus: "completed" | "failed" = "completed";
      let data: any;
      try {
        const res = await fetch(targetUrl, {
          method: "GET",
          headers,
        });

        const text = await res.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
        if (!res.ok) jobStatus = "failed";
      } catch (fetchError) {
        data = { error: fetchError instanceof Error ? fetchError.message : "Unknown error" };
        jobStatus = "failed";
      }

      // Aggiorna lo stato finale nel DB
      await (prisma as any).cronJobRun.update({
        where: { jobKey: target },
        data: {
          status: jobStatus,
          finishedAt: new Date(),
          resultJson: JSON.stringify(data),
        },
      });

      return NextResponse.json({ status: jobStatus === "completed" ? 200 : 500, target, dryRun, data });
    } catch (error) {
      console.error(
        "[API /admin/run-cron/instagram-story] Error triggering cron:",
        error,
      );
      // Prova a marcare il job come fallito se possibile
      try {
        await (prisma as any).cronJobRun.updateMany({
          where: { status: "running" },
          data: { status: "failed", finishedAt: new Date() },
        });
      } catch { /* ignore */ }
      return NextResponse.json(
        {
          error: "Failed to trigger cron",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
      );
    }
  });
}
