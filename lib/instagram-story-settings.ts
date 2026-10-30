import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const INSTAGRAM_STORY_TIMEZONE = "Europe/Rome";
export const DEFAULT_GRAPH_API_VERSION = "v22.0";

export type InstagramStorySchedule = {
  autoPublish: boolean;
  publishDays: number[];
  publishHour: number;
};

export type InstagramStorySettingsRecord = InstagramStorySchedule & {
  igUserId: string | null;
  accessTokenEncrypted: string | null;
  graphApiVersion: string;
  lastRunSlot: string | null;
};

export type InstagramStorySettingsUpdate = InstagramStorySchedule & {
  igUserId: string | null;
  graphApiVersion: string;
  // undefined = keep the stored token, null = remove it, string = replace it.
  accessToken?: string | null;
};

export const DEFAULT_INSTAGRAM_STORY_SCHEDULE: InstagramStorySchedule = {
  autoPublish: false,
  publishDays: [3],
  publishHour: 20,
};

function tokenKey(): Buffer {
  const secret = process.env.INSTAGRAM_TOKEN_SECRET_KEY || process.env.NEXTAUTH_SECRET_KEY;
  if (!secret) throw new Error("instagram_token_key_not_configured");
  return createHash("sha256").update(secret).digest();
}

const TOKEN_AAD = Buffer.from("instagram-story-token:v1");

export function encryptInstagramToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  cipher.setAAD(TOKEN_AAD);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url")}`;
}

export function decryptInstagramToken(value: string): string {
  const [version, payload] = value.split(".");
  if (version !== "v1" || !payload) throw new Error("instagram_token_unreadable");
  const data = Buffer.from(payload, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), data.subarray(0, 12));
  decipher.setAAD(TOKEN_AAD);
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}

export function parseInstagramSettingsPayload(payload: unknown): InstagramStorySettingsUpdate | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;

  const igUserIdRaw = typeof body.igUserId === "string" ? body.igUserId.trim() : "";
  if (igUserIdRaw && !/^\d{5,30}$/.test(igUserIdRaw)) return null;

  const graphApiVersionRaw =
    typeof body.graphApiVersion === "string" && body.graphApiVersion.trim()
      ? body.graphApiVersion.trim()
      : DEFAULT_GRAPH_API_VERSION;
  if (!/^v\d{1,3}\.\d{1,2}$/.test(graphApiVersionRaw)) return null;

  if (typeof body.autoPublish !== "boolean") return null;

  if (!Array.isArray(body.publishDays)) return null;
  const isWeekday = (day: unknown): day is number =>
    typeof day === "number" && Number.isInteger(day) && day >= 0 && day <= 6;
  if (!body.publishDays.every(isWeekday)) return null;
  const publishDays = [...new Set(body.publishDays as number[])].sort((a, b) => a - b);

  const publishHour = body.publishHour;
  if (typeof publishHour !== "number" || !Number.isInteger(publishHour) || publishHour < 0 || publishHour > 23) {
    return null;
  }

  let accessToken: string | null | undefined;
  if (body.accessToken === null) {
    accessToken = null;
  } else if (typeof body.accessToken === "string" && body.accessToken.trim()) {
    accessToken = body.accessToken.trim();
    if (accessToken.length < 20 || accessToken.length > 1024 || /\s/.test(accessToken)) return null;
  }

  return {
    igUserId: igUserIdRaw || null,
    graphApiVersion: graphApiVersionRaw,
    autoPublish: body.autoPublish,
    publishDays,
    publishHour,
    accessToken,
  };
}

function zonedParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: parseInt(get("hour"), 10),
    weekday: weekdays.indexOf(get("weekday")),
  };
}

/**
 * Returns the slot key (local date) when a scheduled run is due, otherwise null.
 * A slot is due from the configured hour until the end of that day, once.
 */
export function getDueStorySlot(
  now: Date,
  schedule: Pick<InstagramStorySchedule, "publishDays" | "publishHour">,
  lastRunSlot: string | null,
  timeZone = INSTAGRAM_STORY_TIMEZONE,
): string | null {
  const local = zonedParts(now, timeZone);
  if (!schedule.publishDays.includes(local.weekday)) return null;
  if (local.hour < schedule.publishHour) return null;
  if (lastRunSlot === local.date) return null;
  return local.date;
}
