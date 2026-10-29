import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminAuth } from "@/lib/auth-helpers";
import {
  DEFAULT_SITE_PRESENTATION,
  normalizeSitePresentation,
  parseSitePresentationPayload,
} from "../../../lib/site-presentation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const saved = await prisma.siteSettings.findUnique({ where: { id: "global" } });
    return NextResponse.json(normalizeSitePresentation(saved?.categories, saved?.quotes), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[site-settings GET] error:", error);
    return NextResponse.json(DEFAULT_SITE_PRESENTATION, {
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function PUT(request: NextRequest) {
  return withAdminAuth(async () => {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
    }

    const settings = parseSitePresentationPayload(payload);
    if (!settings) {
      return NextResponse.json({ error: "Configurazione categorie o citazioni non valida" }, { status: 400 });
    }

    try {
      const saved = await prisma.siteSettings.upsert({
        where: { id: "global" },
        create: { id: "global", categories: settings.categories, quotes: settings.quotes },
        update: { categories: settings.categories, quotes: settings.quotes },
      });
      return NextResponse.json(normalizeSitePresentation(saved.categories, saved.quotes), {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      console.error("[site-settings PUT] error:", error);
      return NextResponse.json({ error: "Impossibile salvare le impostazioni del sito" }, { status: 500 });
    }
  });
}