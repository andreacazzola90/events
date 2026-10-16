import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizeGoogleCalendarEventType } from "../../lib/constants";
import { buildGoogleCalendarEvent, isUpcomingCalendarEvent } from "../../lib/calendar-ics";
import { generateUniqueSlug } from "../../lib/slug-utils";

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.owned";
export const GOOGLE_CALENDAR_LIST_SCOPE = "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
export const GOOGLE_CALENDAR_COOKIE = process.env.NODE_ENV === "production"
  ? "__Host-google-calendar-oauth"
  : "google-calendar-oauth";

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET_KEY &&
    process.env.NEXTAUTH_URL && (process.env.GOOGLE_CALENDAR_TOKEN_SECRET_KEY || process.env.NEXTAUTH_SECRET_KEY));
}

export function getGoogleCalendarClient(origin?: string) {
  if (!isGoogleCalendarConfigured()) throw new Error("Google Calendar non configurato");
  return new OAuth2Client({
    clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET_KEY,
    redirectUri: new URL("/api/account/google-calendar/callback", origin || process.env.NEXTAUTH_URL).toString(),
    transporterOptions: { timeout: 10_000, retry: false },
  });
}

function tokenKey() {
  const secret = process.env.GOOGLE_CALENDAR_TOKEN_SECRET_KEY || process.env.NEXTAUTH_SECRET_KEY;
  if (!secret) throw new Error("Chiave calendario non configurata");
  return createHash("sha256").update(secret).digest();
}

export function encryptCalendarToken(token: string, userId: number): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  cipher.setAAD(Buffer.from(String(userId)));
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function decryptCalendarToken(token: string, userId: number): string {
  const value = Buffer.from(token, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), value.subarray(0, 12));
  decipher.setAAD(Buffer.from(String(userId)));
  decipher.setAuthTag(value.subarray(12, 28));
  return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString("utf8");
}

export function googleCalendarEventId(userId: number, eventId: number): string {
  const origin = new URL(process.env.NEXTAUTH_URL!).origin;
  return createHash("sha256").update(`${origin}:${userId}:${eventId}`).digest("hex");
}

export async function listWritableGoogleCalendars(userId: number) {
  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { userId }, select: { refreshToken: true },
  });
  if (!connection) throw new Error("Google Calendar non collegato");
  const client = getGoogleCalendarClient();
  client.setCredentials({ refresh_token: decryptCalendarToken(connection.refreshToken, userId) });
  const calendars: { id: string; summary: string; backgroundColor: string; primary: boolean }[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
    url.searchParams.set("minAccessRole", "owner");
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("fields", "nextPageToken,items(id,summary,summaryOverride,primary,accessRole,backgroundColor)");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await client.request<{
      items?: { id?: string; summary?: string; summaryOverride?: string; primary?: boolean; accessRole?: string; backgroundColor?: string }[];
      nextPageToken?: string;
    }>({ url: url.toString(), timeout: 10_000, retry: false });
    for (const calendar of response.data.items || []) {
      if (!calendar.id || calendar.accessRole !== "owner") continue;
      calendars.push({
        id: calendar.id,
        summary: calendar.summaryOverride || calendar.summary || calendar.id,
        backgroundColor: calendar.backgroundColor || "#a4bdfc",
        primary: calendar.primary === true,
      });
    }
    pageToken = response.data.nextPageToken;
  } while (pageToken);
  return calendars;
}

export async function disconnectGoogleCalendar(userId: number) {
  const connection = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
  await prisma.$transaction([
    prisma.googleCalendarConnection.deleteMany({ where: { userId } }),
    prisma.googleCalendarDelivery.updateMany({
      where: { userId, status: { in: ["pending", "processing"] } },
      data: { status: "skipped", leasedUntil: null },
    }),
  ]);
  if (connection && isGoogleCalendarConfigured()) {
    after(async () => {
      try {
        await getGoogleCalendarClient().revokeToken(decryptCalendarToken(connection.refreshToken, userId));
      } catch {
        console.warn("[Google Calendar] Accesso locale rimosso; revoca remota non riuscita");
      }
    });
  }
}

export async function createEventWithCalendar(args: Prisma.EventCreateArgs) {
  const event = await prisma.$transaction(async (tx) => {
    const saved = await tx.event.create(args);
    if (!isUpcomingCalendarEvent(saved)) return saved;
    const users = await tx.user.findMany({
      where: {
          googleCalendar: { isNot: null },
      },
      select: { id: true },
    });
    if (users.length) {
      await tx.googleCalendarDelivery.createMany({
        data: users.map(user => ({ userId: user.id, eventId: saved.id })),
        skipDuplicates: true,
      });
    }
    return saved;
  });
  return event;
}

export function scheduleCalendarDeliveries() {
  after(async () => {
    try {
      await processCalendarDeliveries();
    } catch {
      console.error("[Google Calendar] Elaborazione coda non riuscita; retry tramite cron");
    }
  });
}

export async function processCalendarDeliveries(limit = 100) {
  if (!isGoogleCalendarConfigured()) return { delivered: 0, skipped: 0, retried: 0 };
  const results = { delivered: 0, skipped: 0, retried: 0 };
  const deadline = Date.now() + 40_000;
  let visited = 0;
  while (visited < limit && Date.now() < deadline) {
    const now = new Date();
    const eligible: Prisma.GoogleCalendarDeliveryWhereInput = {
      OR: [
        { status: "pending", nextAttemptAt: { lte: now } },
        { status: "processing", leasedUntil: { lte: now } },
      ],
    };
    const jobs = await prisma.googleCalendarDelivery.findMany({
      where: eligible, orderBy: { createdAt: "asc" }, take: Math.min(10, limit - visited),
    });
    if (!jobs.length) break;
    for (const candidate of jobs) {
      if (Date.now() >= deadline) break;
      visited++;
      const leasedUntil = new Date(Date.now() + 120_000);
      const claim = await prisma.googleCalendarDelivery.updateMany({
        where: { id: candidate.id, ...eligible },
        data: { status: "processing", leasedUntil, attempts: { increment: 1 } },
      });
      if (!claim.count) continue;
      const job = await prisma.googleCalendarDelivery.findUnique({
        where: { id: candidate.id },
        include: { event: true, user: { include: { googleCalendar: true } } },
      });
      if (!job || job.status !== "processing" || job.leasedUntil?.getTime() !== leasedUntil.getTime() ||
        job.leasedUntil.getTime() <= Date.now()) continue;
      const finish = async (data: Prisma.GoogleCalendarDeliveryUpdateManyMutationInput) => {
        const updated = await prisma.googleCalendarDelivery.updateMany({
          where: { id: job.id, status: "processing", leasedUntil },
          data: { ...data, leasedUntil: null },
        });
        return updated.count > 0;
      };
      if (!isUpcomingCalendarEvent(job.event)) {
        if (await finish({ status: "skipped", lastError: null })) results.skipped++;
        continue;
      }
      const connection = job.user.googleCalendar;
      if (!connection) {
        if (await finish({ status: "pending", lastError: "google_reconnect_required", nextAttemptAt: new Date(Date.now() + 60_000) })) results.retried++;
        continue;
      }
      const eventType = normalizeGoogleCalendarEventType(job.user.calendarEventType);
      const url = new URL(`/events/${generateUniqueSlug(job.event.title, job.eventId)}`, process.env.NEXTAUTH_URL).toString();
      const payload = eventType ? buildGoogleCalendarEvent(job.event, url, eventType) : null;
      if (!payload) {
        if (await finish({ status: "failed", lastError: eventType ? "google_event_time_required" : "google_event_type_invalid" })) results.retried++;
        continue;
      }
      try {
        const client = getGoogleCalendarClient();
        client.setCredentials({ refresh_token: decryptCalendarToken(connection.refreshToken, job.userId) });
        const id = googleCalendarEventId(job.userId, job.eventId);
        const calendarEventsUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendarId || "primary")}/events`;
        try {
          await client.request({
            url: calendarEventsUrl,
            method: "POST", data: { ...payload, id }, timeout: 10_000, retry: false,
          });
        } catch (error) {
          if (getGoogleErrorStatus(error) !== 409) throw error;
          const existing = await client.request<{ id?: string }>({
            url: `${calendarEventsUrl}/${id}`, timeout: 10_000, retry: false,
          });
          if (existing.data.id !== id) throw error;
        }
        if (await finish({ status: "delivered", deliveredAt: new Date(), lastError: null })) results.delivered++;
      } catch (error) {
        const status = getGoogleErrorStatus(error);
        const googleError = error as { response?: { data?: { error?: string | { errors?: { reason?: string }[] } } } };
        const revoked = status === 401 || googleError.response?.data?.error === "invalid_grant";
        const details = googleError.response?.data?.error;
        const quotaExceeded = typeof details === "object" && details.errors?.some(item =>
          ["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded"].includes(item.reason || ""));
        let credentialsChanged = false;
        if (revoked) {
          const removed = await prisma.googleCalendarConnection.deleteMany({
            where: { userId: job.userId, refreshToken: connection.refreshToken },
          });
          if (!removed.count) {
            const current = await prisma.googleCalendarConnection.findUnique({ where: { userId: job.userId } });
            credentialsChanged = Boolean(current && current.refreshToken !== connection.refreshToken);
          }
        }
        const terminal = !revoked && (status === 400 || status === 404 || (status === 403 && !quotaExceeded));
        if (await finish({
          status: terminal ? "failed" : "pending",
          lastError: credentialsChanged ? null : revoked ? "google_reconnect_required"
            : status === 404 ? "google_calendar_not_found" : `google_http_${status || "network"}`,
          nextAttemptAt: new Date(Date.now() + (credentialsChanged ? 0 : Math.min(24 * 60 * 60_000, 60_000 * 2 ** Math.min(job.attempts, 10)))),
        })) results.retried++;
      }
    }
  }
  return results;
}

function getGoogleErrorStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}