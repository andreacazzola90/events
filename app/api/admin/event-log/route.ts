import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminAuth } from "@/lib/auth-helpers";

/**
 * GET /api/admin/event-log?page=1&limit=50&origin=cron&search=
 * Restituisce gli eventi con origine cron, paginati.
 */
export async function GET(request: NextRequest) {
  return withAdminAuth(async () => {
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
    const origin = searchParams.get("origin") ?? "";
    const search = (searchParams.get("search") ?? "").trim();

    const skip = (page - 1) * limit;

    // Filtra per eventi crawled (origin diverso da "user") o con sourceUrl
    const where: Record<string, unknown> = {
      AND: [
        origin ? { origin } : { NOT: { origin: "user" } },
        search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { location: { contains: search, mode: "insensitive" } },
                { sourceUrl: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };

    try {
      const [total, events] = await Promise.all([
        prisma.event.count({ where }),
        prisma.event.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          select: {
            id: true,
            title: true,
            date: true,
            time: true,
            location: true,
            category: true,
            origin: true,
            sourceUrl: true,
            imageUrl: true,
            createdAt: true,
          },
        }),
      ]);

      return NextResponse.json({ events, total, page, limit });
    } catch (error) {
      console.error("[event-log GET] error:", error);
      return NextResponse.json({ error: "Failed to fetch event log" }, { status: 500 });
    }
  });
}
