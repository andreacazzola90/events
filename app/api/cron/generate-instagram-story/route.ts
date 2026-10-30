import { NextRequest, NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { createElement } from "react";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { getSupabaseClient } from "@/lib/supabase";
import {
  DEFAULT_GRAPH_API_VERSION,
  DEFAULT_INSTAGRAM_STORY_SCHEDULE,
  INSTAGRAM_STORY_TIMEZONE,
  decryptInstagramToken,
  getDueStorySlot,
  type InstagramStorySettingsRecord,
} from "../../../../lib/instagram-story-settings";

export const maxDuration = 60;

type StoryEvent = {
  id: number;
  title: string;
  date: string;
  time: string;
  location: string;
  imageUrl?: string | null;
};

type StoryEventWithDate = StoryEvent & { parsedDate: Date | null };

type InstagramPublishResult = {
  containerId: string;
  mediaId: string;
};

type InstagramCredentials = {
  igUserId: string;
  accessToken: string;
  graphApiVersion: string;
};

function parseEventDate(value: string): Date | null {
  if (!value) return null;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value
      .split("/")
      .map((part) => parseInt(part, 10));
    const parsed = new Date(year, month - 1, day);
    parsed.setHours(0, 0, 0, 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value
      .split("-")
      .map((part) => parseInt(part, 10));
    const parsed = new Date(year, month - 1, day);
    parsed.setHours(0, 0, 0, 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getStoryWindowFromDate(reference: Date): { start: Date; end: Date } {
  const base = new Date(reference);
  base.setHours(0, 0, 0, 0);

  const dayOfWeek = base.getDay();
  const daysUntilThursday = (4 - dayOfWeek + 7) % 7;
  const start = new Date(base);
  start.setDate(base.getDate() + daysUntilThursday);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return { start, end };
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function formatDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;
const LIST_TOP = 270;
const LIST_BOTTOM = 1775;
const HEADING_HEIGHT = 54;
const ROW_HEIGHT = 104;
const THUMB_SIZE = 88;
const MORE_HEIGHT = 56;
const THUMB_MAX_BYTES = 8 * 1024 * 1024;

type StoryBlock =
  | { kind: "heading"; text: string }
  | { kind: "event"; event: StoryEvent };

/** Fits date headings + event rows in the available height; returns hidden count. */
function layoutStoryBlocks(events: StoryEvent[]): { blocks: StoryBlock[]; hidden: number } {
  const blocks: StoryBlock[] = [];
  const budget = LIST_BOTTOM - LIST_TOP;
  let used = 0;
  let shown = 0;
  let currentDate: string | null = null;

  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    const needsHeading = event.date !== currentDate;
    const cost = ROW_HEIGHT + (needsHeading ? HEADING_HEIGHT : 0);
    const remainingAfter = events.length - index - 1;
    const reserve = remainingAfter > 0 ? MORE_HEIGHT : 0;
    if (used + cost + reserve > budget) break;

    if (needsHeading) {
      const dateObj = parseEventDate(event.date);
      blocks.push({
        kind: "heading",
        text: (dateObj ? formatDateLabel(dateObj) : event.date).toUpperCase(),
      });
      currentDate = event.date;
    }
    blocks.push({ kind: "event", event });
    used += cost;
    shown++;
  }

  return { blocks, hidden: events.length - shown };
}

async function loadThumbnail(imageUrl: string | null | undefined): Promise<string | null> {
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) return null;
  try {
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > THUMB_MAX_BYTES) return null;
    const source = Buffer.from(await response.arrayBuffer());
    if (source.length > THUMB_MAX_BYTES) return null;
    const thumb = await sharp(source)
      .resize(THUMB_SIZE * 2, THUMB_SIZE * 2, { fit: "cover", position: "attention" })
      .jpeg({ quality: 78 })
      .toBuffer();
    return `data:image/jpeg;base64,${thumb.toString("base64")}`;
  } catch (error) {
    console.warn("[Instagram Story Cron] Thumbnail skipped:", imageUrl, error instanceof Error ? error.message : error);
    return null;
  }
}

// Rendered with next/og (satori + bundled font) because serverless runtimes
// have no system fonts, so SVG <text> rasterized by sharp/librsvg is blank.
async function renderStoryJpeg(
  events: StoryEvent[],
  start: Date,
  end: Date,
): Promise<Buffer> {
  const { blocks, hidden } = layoutStoryBlocks(events);
  const thumbnails = new Map<number, string | null>();
  await Promise.all(
    blocks.map(async (block) => {
      if (block.kind === "event") {
        thumbnails.set(block.event.id, await loadThumbnail(block.event.imageUrl));
      }
    }),
  );

  const shortDate = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
  });
  const rangeText = `${shortDate.format(start)} → ${shortDate.format(end)}`;

  const h = createElement;
  const text = (content: string, style: Record<string, unknown>) =>
    h("div", { style: { display: "flex", whiteSpace: "nowrap", overflow: "hidden", ...style } }, content);

  const renderEventRow = (event: StoryEvent) => {
    const thumb = thumbnails.get(event.id);
    const details = [event.time?.trim(), event.location?.trim()].filter(Boolean).join(" • ");
    return h(
      "div",
      {
        key: `event-${event.id}`,
        style: { display: "flex", alignItems: "center", height: ROW_HEIGHT, gap: 24 },
      },
      thumb
        ? h("img", {
            src: thumb,
            width: THUMB_SIZE,
            height: THUMB_SIZE,
            style: { width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: 14, objectFit: "cover" },
          })
        : h(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: THUMB_SIZE,
                height: THUMB_SIZE,
                borderRadius: 14,
                background: "rgba(255,255,255,0.12)",
                color: "#FDE68A",
                fontSize: 40,
              },
            },
            (event.title.trim()[0] || "•").toUpperCase(),
          ),
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 6 } },
        text(truncateText(event.title.replace(/\s+/g, " ").trim(), 50), {
          fontSize: 30,
          color: "#FFFFFF",
        }),
        details
          ? text(truncateText(details.replace(/\s+/g, " "), 62), { fontSize: 23, color: "#CBD5E1" })
          : null,
      ),
    );
  };

  const element = h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        background: "linear-gradient(135deg, #111827 0%, #1F2937 50%, #312E81 100%)",
        color: "#FFFFFF",
        fontFamily: "sans-serif",
      },
    },
    h("div", {
      style: {
        position: "absolute",
        left: 40,
        top: 40,
        width: STORY_WIDTH - 80,
        height: STORY_HEIGHT - 80,
        border: "2px solid rgba(255,255,255,0.25)",
        borderRadius: 28,
      },
    }),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          paddingLeft: 72,
          paddingRight: 72,
          paddingTop: 70,
        },
      },
      text("EVENTI SETTIMANA", { fontSize: 64, height: 78 }),
      text(rangeText, { fontSize: 44, color: "#93C5FD", height: 56 }),
      text("Dal giovedì al mercoledì successivo", { fontSize: 26, color: "#E5E7EB", height: 40 }),
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: 72,
          right: 72,
          top: LIST_TOP,
        },
      },
      ...blocks.map((block, index) =>
        block.kind === "heading"
          ? text(block.text, {
              key: `heading-${index}`,
              height: HEADING_HEIGHT,
              alignItems: "flex-end",
              paddingBottom: 8,
              fontSize: 30,
              color: "#FDE68A",
            })
          : renderEventRow(block.event),
      ),
      hidden > 0
        ? text(`+ altri ${hidden} ${hidden === 1 ? "evento" : "eventi"} sul sito`, {
            height: MORE_HEIGHT,
            alignItems: "flex-end",
            fontSize: 28,
            color: "#93C5FD",
          })
        : null,
    ),
    text("EventScanner • Schio e Alto Vicentino", {
      position: "absolute",
      left: 72,
      top: 1806,
      fontSize: 26,
      color: "#D1D5DB",
    }),
  );

  const png = await new ImageResponse(element, {
    width: STORY_WIDTH,
    height: STORY_HEIGHT,
  }).arrayBuffer();

  return sharp(Buffer.from(png)).jpeg({ quality: 90 }).toBuffer();
}

async function loadStorySettings(): Promise<{
  record: InstagramStorySettingsRecord | null;
  available: boolean;
}> {
  try {
    const record = await prisma.instagramStorySettings.findUnique({ where: { id: "global" } });
    return { record, available: true };
  } catch (error) {
    // Table may be missing until the migration is applied: fall back to env config.
    console.warn(
      "[Instagram Story Cron] Settings unavailable, using env fallback:",
      error instanceof Error ? error.message : error,
    );
    return { record: null, available: false };
  }
}

function resolveCredentials(record: InstagramStorySettingsRecord | null): InstagramCredentials | null {
  const igUserId = record?.igUserId || process.env.INSTAGRAM_IG_USER_ID || "";
  const accessToken = record?.accessTokenEncrypted
    ? decryptInstagramToken(record.accessTokenEncrypted)
    : process.env.INSTAGRAM_ACCESS_TOKEN_SECRET_KEY || "";
  if (!igUserId || !accessToken) return null;
  return {
    igUserId,
    accessToken,
    graphApiVersion:
      record?.graphApiVersion || process.env.INSTAGRAM_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION,
  };
}

async function updateStorySettings(data: Record<string, unknown>) {
  try {
    await prisma.instagramStorySettings.update({ where: { id: "global" }, data });
  } catch (error) {
    console.warn(
      "[Instagram Story Cron] Unable to persist run state:",
      error instanceof Error ? error.message : error,
    );
  }
}

/** Atomically claims a scheduled slot so concurrent cron invocations run it once. */
async function claimStorySlot(slot: string, now: Date, autoPublish: boolean): Promise<boolean> {
  await prisma.instagramStorySettings.upsert({
    where: { id: "global" },
    create: { id: "global", autoPublish },
    update: {},
  });
  const claimed = await prisma.instagramStorySettings.updateMany({
    where: { id: "global", OR: [{ lastRunSlot: null }, { lastRunSlot: { not: slot } }] },
    data: { lastRunSlot: slot, lastRunAt: now },
  });
  return claimed.count === 1;
}

async function graphRequest(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    const message = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(`Instagram Graph API: ${message}`);
  }
  return data;
}

async function publishInstagramStory(
  imageUrl: string,
  credentials: InstagramCredentials,
): Promise<InstagramPublishResult> {
  const { igUserId, accessToken, graphApiVersion } = credentials;
  const graphBaseUrl = `https://graph.facebook.com/${graphApiVersion}`;
  const formHeaders = { "Content-Type": "application/x-www-form-urlencoded" };

  const createData = await graphRequest(`${graphBaseUrl}/${igUserId}/media`, {
    method: "POST",
    headers: formHeaders,
    body: new URLSearchParams({
      image_url: imageUrl,
      media_type: "STORIES",
      access_token: accessToken,
    }),
  });
  if (!createData?.id) {
    throw new Error("Instagram media container creation failed: missing container id");
  }
  const containerId = createData.id as string;

  // Image containers are usually ready immediately; wait briefly if not.
  for (let attempt = 0; attempt < 10; attempt++) {
    const status = await graphRequest(
      `${graphBaseUrl}/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`,
    );
    if (status?.status_code === "FINISHED" || !status?.status_code) break;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      throw new Error(`Instagram media container status: ${status.status_code}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  const publishData = await graphRequest(`${graphBaseUrl}/${igUserId}/media_publish`, {
    method: "POST",
    headers: formHeaders,
    body: new URLSearchParams({
      creation_id: containerId,
      access_token: accessToken,
    }),
  });
  if (!publishData?.id) {
    throw new Error("Instagram story publish failed: missing media id");
  }

  return {
    containerId,
    mediaId: publishData.id as string,
  };
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET || process.env.CRON_SECRET_KEY;
  if (!cronSecret) {
    return NextResponse.json({ error: "cron_secret_not_configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl?.searchParams;
  const force = params?.get("force") === "1";
  const publishParam = params?.get("publish");

  try {
    const now = new Date();
    const { record, available } = await loadStorySettings();
    const envAutoPublish = process.env.INSTAGRAM_AUTO_PUBLISH_STORY === "true";
    const autoPublish = record ? record.autoPublish : envAutoPublish;
    const schedule = record ?? DEFAULT_INSTAGRAM_STORY_SCHEDULE;

    let slot: string | null = null;
    if (!force) {
      slot = getDueStorySlot(now, schedule, record?.lastRunSlot ?? null);
      // Without the settings table the slot cannot be persisted: only run in the exact hour.
      const exactHour =
        Number(
          new Intl.DateTimeFormat("en-GB", {
            timeZone: INSTAGRAM_STORY_TIMEZONE,
            hour: "2-digit",
            hourCycle: "h23",
          }).format(now),
        ) === schedule.publishHour;
      const due = slot !== null && (available ? await claimStorySlot(slot, now, autoPublish) : exactHour);
      if (!due) {
        return NextResponse.json({
          status: "skipped",
          reason: "not_scheduled",
          schedule: {
            publishDays: schedule.publishDays,
            publishHour: schedule.publishHour,
            timeZone: INSTAGRAM_STORY_TIMEZONE,
          },
        });
      }
    }

    const shouldPublishToInstagram =
      publishParam === "1" ? true : publishParam === "0" ? false : autoPublish;

    const { start, end } = getStoryWindowFromDate(now);

    const allEvents: StoryEvent[] = await prisma.event.findMany({
      select: {
        id: true,
        title: true,
        date: true,
        time: true,
        location: true,
        imageUrl: true,
      },
    });

    const eventsInRange = allEvents
      .map(
        (event: StoryEvent): StoryEventWithDate => ({
          ...event,
          parsedDate: parseEventDate(event.date),
        }),
      )
      .filter(
        (
          event: StoryEventWithDate,
        ): event is StoryEventWithDate & { parsedDate: Date } => {
          if (!event.parsedDate) return false;
          return (
            event.parsedDate.getTime() >= start.getTime() &&
            event.parsedDate.getTime() <= end.getTime()
          );
        },
      )
      .sort((a, b) => {
        const dateDiff = a.parsedDate.getTime() - b.parsedDate.getTime();
        if (dateDiff !== 0) return dateDiff;
        return (a.time || "").localeCompare(b.time || "", "it-IT");
      })
      .map(
        (event: StoryEventWithDate & { parsedDate: Date }): StoryEvent => ({
          id: event.id,
          title: event.title,
          date: event.date,
          time: event.time,
          location: event.location,
          imageUrl: event.imageUrl,
        }),
      );

    const safeEvents = eventsInRange.length
      ? eventsInRange
      : [
          {
            id: -1,
            title: "Nessun evento in calendario",
            date: toIsoDate(start),
            time: "",
            location: "Torna presto per i prossimi aggiornamenti",
          },
        ];

    const jpgBuffer = await renderStoryJpeg(safeEvents, start, end);

    const bucket = process.env.STORY_BUCKET || "events";
    const latestPath = "stories/weekly-events-latest.jpg";
    const archivePath = `stories/archive/weekly-events-${toIsoDate(start)}_to_${toIsoDate(end)}.jpg`;

    const latestUpload = await getSupabaseClient().storage
      .from(bucket)
      .upload(latestPath, jpgBuffer, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (latestUpload.error) {
      throw latestUpload.error;
    }

    const archiveUpload = await getSupabaseClient().storage
      .from(bucket)
      .upload(archivePath, jpgBuffer, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (archiveUpload.error) {
      console.warn(
        "[Instagram Story Cron] Archive upload warning:",
        archiveUpload.error.message,
      );
    }

    const latestPublic = getSupabaseClient().storage.from(bucket).getPublicUrl(latestPath)
      .data.publicUrl;
    const archivePublic = getSupabaseClient().storage
      .from(bucket)
      .getPublicUrl(archivePath).data.publicUrl;

    let instagramStory: {
      published: boolean;
      containerId?: string;
      mediaId?: string;
      skipped?: boolean;
      reason?: string;
    };

    if (shouldPublishToInstagram) {
      const credentials = resolveCredentials(record);
      if (!credentials) {
        throw new Error(
          "Credenziali Instagram mancanti: imposta ID account e access token nel tab Instagram dell'admin",
        );
      }
      // Publish the immutable archive copy so Instagram never fetches a cached "latest".
      try {
        const instagramPublish = await publishInstagramStory(
          archiveUpload.error ? latestPublic : archivePublic,
          credentials,
        );
        instagramStory = {
          published: true,
          containerId: instagramPublish.containerId,
          mediaId: instagramPublish.mediaId,
        };
        if (available) {
          await updateStorySettings({ lastMediaId: instagramPublish.mediaId, lastError: null });
        }
      } catch (publishError) {
        if (available) {
          await updateStorySettings({
            lastError: publishError instanceof Error ? publishError.message : "Unknown error",
          });
        }
        throw publishError;
      }
    } else {
      instagramStory = {
        published: false,
        skipped: true,
        reason: "Pubblicazione automatica disattivata (attivala nel tab Instagram dell'admin)",
      };
    }

    return NextResponse.json({
      status: "success",
      generatedAt: now.toISOString(),
      trigger: force ? "manual" : "schedule",
      range: {
        from: toIsoDate(start),
        to: toIsoDate(end),
      },
      totalEvents: eventsInRange.length,
      latestImageUrl: latestPublic,
      archiveImageUrl: archivePublic,
      instagramStory,
    });
  } catch (error) {
    console.error("[Instagram Story Cron] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate weekly Instagram story image",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
