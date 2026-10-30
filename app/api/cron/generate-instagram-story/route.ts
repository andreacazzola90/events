import { NextRequest, NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { createElement } from "react";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { getSupabaseClient } from "@/lib/supabase";

export const maxDuration = 60;

type StoryEvent = {
  id: number;
  title: string;
  date: string;
  time: string;
  location: string;
};

type StoryEventWithDate = StoryEvent & { parsedDate: Date | null };

type InstagramPublishResult = {
  containerId: string;
  mediaId: string;
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

type StoryLine = { text: string; heading?: boolean };

function buildStoryLines(events: StoryEvent[]): StoryLine[] {
  const eventsByDate = new Map<string, StoryEvent[]>();
  for (const event of events) {
    const key = event.date;
    if (!eventsByDate.has(key)) {
      eventsByDate.set(key, []);
    }
    eventsByDate.get(key)!.push(event);
  }

  const lines: StoryLine[] = [];
  for (const [dateStr, dateEvents] of eventsByDate.entries()) {
    const dateObj = parseEventDate(dateStr);
    const dateLabel = dateObj ? formatDateLabel(dateObj) : dateStr;
    lines.push({ text: dateLabel.toUpperCase(), heading: true });

    for (const ev of dateEvents) {
      const timeLabel = ev.time?.trim() ? `${ev.time.trim()} • ` : "";
      const eventLabel = truncateText(
        `${timeLabel}${ev.title} — ${ev.location}`.replace(/\s+/g, " ").trim(),
        70,
      );
      lines.push({ text: `• ${eventLabel}` });
    }
  }
  return lines;
}

// Rendered with next/og (satori + bundled font) because serverless runtimes
// have no system fonts, so SVG <text> rasterized by sharp/librsvg is blank.
async function renderStoryJpeg(
  events: StoryEvent[],
  start: Date,
  end: Date,
): Promise<Buffer> {
  const topY = 260;
  const bottomPadding = 120;
  const maxTextHeight = STORY_HEIGHT - topY - bottomPadding;
  const lines = buildStoryLines(events);

  const rawLineHeight = Math.floor(maxTextHeight / Math.max(lines.length, 1));
  const lineHeight = Math.max(14, Math.min(34, rawLineHeight));
  const headingSize = Math.max(18, Math.min(30, lineHeight + 4));
  const textSize = Math.max(13, Math.min(24, lineHeight - 1));

  const shortDate = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
  });
  const rangeText = `${shortDate.format(start)} → ${shortDate.format(end)}`;

  const h = createElement;
  const text = (content: string, style: Record<string, unknown>) =>
    h("div", { style: { display: "flex", whiteSpace: "nowrap", ...style } }, content);

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
          paddingLeft: 64,
          paddingRight: 64,
          paddingTop: 52,
        },
      },
      text("EVENTI SETTIMANA", { fontSize: 58, fontWeight: 800, height: 70 }),
      text(rangeText, { fontSize: 42, color: "#93C5FD", height: 52 }),
      text("Dal giovedì al mercoledì successivo", {
        fontSize: 26,
        color: "#E5E7EB",
        height: 50,
      }),
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: 64,
          right: 64,
          top: topY - lineHeight,
        },
      },
      ...lines.map((line) =>
        text(line.text, {
          height: lineHeight,
          alignItems: "flex-end",
          overflow: "hidden",
          fontSize: line.heading ? headingSize : textSize,
          fontWeight: line.heading ? 700 : 500,
          color: line.heading ? "#FDE68A" : "#FFFFFF",
        }),
      ),
    ),
    text("aggiornato automaticamente ogni mercoledì sera", {
      position: "absolute",
      left: 64,
      top: 1820,
      fontSize: 24,
      color: "#D1D5DB",
    }),
  );

  const png = await new ImageResponse(element, {
    width: STORY_WIDTH,
    height: STORY_HEIGHT,
  }).arrayBuffer();

  return sharp(Buffer.from(png)).jpeg({ quality: 92 }).toBuffer();
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function publishInstagramStory(
  imageUrl: string,
): Promise<InstagramPublishResult> {
  const igUserId = getRequiredEnv("INSTAGRAM_IG_USER_ID");
  const accessToken = getRequiredEnv("INSTAGRAM_ACCESS_TOKEN_SECRET_KEY");
  const graphVersion = process.env.INSTAGRAM_GRAPH_API_VERSION || "v22.0";
  const graphBaseUrl = `https://graph.facebook.com/${graphVersion}`;

  const createBody = new URLSearchParams({
    image_url: imageUrl,
    media_type: "STORIES",
    access_token: accessToken,
  });

  const createResponse = await fetch(`${graphBaseUrl}/${igUserId}/media`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: createBody,
  });

  const createData: any = await createResponse.json();
  if (!createResponse.ok || !createData?.id) {
    throw new Error(
      `Instagram media container creation failed: ${JSON.stringify(createData)}`,
    );
  }

  const containerId = createData.id as string;

  const publishBody = new URLSearchParams({
    creation_id: containerId,
    access_token: accessToken,
  });

  const publishResponse = await fetch(
    `${graphBaseUrl}/${igUserId}/media_publish`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: publishBody,
    },
  );

  const publishData: any = await publishResponse.json();
  if (!publishResponse.ok || !publishData?.id) {
    throw new Error(
      `Instagram story publish failed: ${JSON.stringify(publishData)}`,
    );
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

  try {
    const now = new Date();
    const { start, end } = getStoryWindowFromDate(now);

    const allEvents: StoryEvent[] = await prisma.event.findMany({
      select: {
        id: true,
        title: true,
        date: true,
        time: true,
        location: true,
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

    const shouldPublishToInstagram =
      process.env.INSTAGRAM_AUTO_PUBLISH_STORY === "true";
    let instagramStory: {
      published: boolean;
      containerId?: string;
      mediaId?: string;
      skipped?: boolean;
      reason?: string;
    };

    if (shouldPublishToInstagram) {
      const instagramPublish = await publishInstagramStory(latestPublic);
      instagramStory = {
        published: true,
        containerId: instagramPublish.containerId,
        mediaId: instagramPublish.mediaId,
      };
    } else {
      instagramStory = {
        published: false,
        skipped: true,
        reason:
          "Instagram auto publish disabled (set INSTAGRAM_AUTO_PUBLISH_STORY=true to enable)",
      };
    }

    return NextResponse.json({
      status: "success",
      generatedAt: now.toISOString(),
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
