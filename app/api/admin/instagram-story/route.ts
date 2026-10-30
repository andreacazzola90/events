import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminAuth } from "@/lib/auth-helpers";
import {
  DEFAULT_GRAPH_API_VERSION,
  DEFAULT_INSTAGRAM_STORY_SCHEDULE,
  INSTAGRAM_STORY_TIMEZONE,
  decryptInstagramToken,
  encryptInstagramToken,
  parseInstagramSettingsPayload,
} from "../../../../lib/instagram-story-settings";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

type StoredSettings = Awaited<ReturnType<typeof prisma.instagramStorySettings.findUnique>>;

function serialize(record: StoredSettings) {
  return {
    igUserId: record?.igUserId ?? "",
    hasAccessToken: Boolean(record?.accessTokenEncrypted),
    graphApiVersion: record?.graphApiVersion ?? DEFAULT_GRAPH_API_VERSION,
    autoPublish: record?.autoPublish ?? DEFAULT_INSTAGRAM_STORY_SCHEDULE.autoPublish,
    publishDays: record?.publishDays ?? DEFAULT_INSTAGRAM_STORY_SCHEDULE.publishDays,
    publishHour: record?.publishHour ?? DEFAULT_INSTAGRAM_STORY_SCHEDULE.publishHour,
    timeZone: INSTAGRAM_STORY_TIMEZONE,
    lastRunSlot: record?.lastRunSlot ?? null,
    lastRunAt: record?.lastRunAt ?? null,
    lastMediaId: record?.lastMediaId ?? null,
    lastError: record?.lastError ?? null,
    envFallback: {
      igUserId: Boolean(process.env.INSTAGRAM_IG_USER_ID),
      accessToken: Boolean(process.env.INSTAGRAM_ACCESS_TOKEN_SECRET_KEY),
    },
  };
}

function storageError(error: unknown) {
  console.error("[admin/instagram-story] storage error:", error);
  return NextResponse.json(
    { error: "Impostazioni Instagram non disponibili: applica la migrazione del database." },
    { status: 503, headers: NO_STORE },
  );
}

export async function GET() {
  return withAdminAuth(async () => {
    try {
      const record = await prisma.instagramStorySettings.findUnique({ where: { id: "global" } });
      return NextResponse.json(serialize(record), { headers: NO_STORE });
    } catch (error) {
      return storageError(error);
    }
  });
}

export async function PUT(request: NextRequest) {
  return withAdminAuth(async () => {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
    }

    const settings = parseInstagramSettingsPayload(payload);
    if (!settings) {
      return NextResponse.json({ error: "Impostazioni Instagram non valide" }, { status: 400 });
    }

    let accessTokenEncrypted: string | null | undefined;
    try {
      if (settings.accessToken === null) accessTokenEncrypted = null;
      else if (settings.accessToken) accessTokenEncrypted = encryptInstagramToken(settings.accessToken);
    } catch (error) {
      console.error("[admin/instagram-story] encryption error:", error);
      return NextResponse.json(
        { error: "Chiave di cifratura non configurata (INSTAGRAM_TOKEN_SECRET_KEY o NEXTAUTH_SECRET_KEY)" },
        { status: 503 },
      );
    }

    const data = {
      igUserId: settings.igUserId,
      graphApiVersion: settings.graphApiVersion,
      autoPublish: settings.autoPublish,
      publishDays: settings.publishDays,
      publishHour: settings.publishHour,
      ...(accessTokenEncrypted !== undefined ? { accessTokenEncrypted } : {}),
    };

    try {
      const saved = await prisma.instagramStorySettings.upsert({
        where: { id: "global" },
        create: { id: "global", ...data },
        update: data,
      });
      return NextResponse.json(serialize(saved), { headers: NO_STORE });
    } catch (error) {
      return storageError(error);
    }
  });
}

/** POST: verifies the saved (or env) credentials against the Instagram Graph API. */
export async function POST() {
  return withAdminAuth(async () => {
    let record: StoredSettings = null;
    try {
      record = await prisma.instagramStorySettings.findUnique({ where: { id: "global" } });
    } catch (error) {
      return storageError(error);
    }

    const igUserId = record?.igUserId || process.env.INSTAGRAM_IG_USER_ID || "";
    let accessToken = process.env.INSTAGRAM_ACCESS_TOKEN_SECRET_KEY || "";
    try {
      if (record?.accessTokenEncrypted) accessToken = decryptInstagramToken(record.accessTokenEncrypted);
    } catch {
      return NextResponse.json({ ok: false, error: "Token salvato non leggibile: inseriscilo di nuovo" });
    }
    if (!igUserId || !accessToken) {
      return NextResponse.json({ ok: false, error: "Inserisci ID account Instagram e access token" });
    }

    const version = record?.graphApiVersion || process.env.INSTAGRAM_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION;
    try {
      const response = await fetch(
        `https://graph.facebook.com/${version}/${encodeURIComponent(igUserId)}?fields=username,name&access_token=${encodeURIComponent(accessToken)}`,
        { signal: AbortSignal.timeout(10000) },
      );
      const data: any = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) {
        return NextResponse.json({ ok: false, error: data?.error?.message || `HTTP ${response.status}` });
      }
      return NextResponse.json({ ok: true, username: data.username ?? null, name: data.name ?? null });
    } catch (error) {
      return NextResponse.json({
        ok: false,
        error: error instanceof Error ? error.message : "Connessione a Instagram non riuscita",
      });
    }
  });
}
