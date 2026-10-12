import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "../../../../lib/auth-helpers";
import { prisma } from "../../../../lib/prisma";
import { listWritableGoogleCalendars, scheduleCalendarDeliveries } from "../../../../lib/google-calendar";

export async function GET() {
  return withAuth(async userId => {
    try {
      const connection = await prisma.googleCalendarConnection.findUnique({
        where: { userId }, select: { calendarId: true },
      });
      if (!connection) return NextResponse.json({ error: "google_calendar_not_connected" }, { status: 409 });
      const calendars = await listWritableGoogleCalendars(userId);
      return NextResponse.json({ calendars, selectedCalendarId: connection.calendarId });
    } catch (error) {
      if (isMissingCalendarTargetColumn(error)) {
        return NextResponse.json({ error: "google_calendar_schema_update_required" }, { status: 503 });
      }
      const status = getGoogleErrorStatus(error);
      return status === 401 || status === 403
        ? NextResponse.json({ error: "google_calendar_reconnect_required" }, { status: 409 })
        : NextResponse.json({ error: "google_calendar_unavailable" }, { status: 502 });
    }
  });
}

export async function PUT(request: NextRequest) {
  return withAuth(async userId => {
    if (request.headers.get("origin") !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Origine non valida" }, { status: 403 });
    }
    const body = await request.json().catch(() => null);
    const calendarId = typeof body?.calendarId === "string" ? body.calendarId.trim() : "";
    if (!calendarId || calendarId.length > 1024) {
      return NextResponse.json({ error: "Calendario Google non valido" }, { status: 400 });
    }
    try {
      const connection = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
      if (!connection) return NextResponse.json({ error: "google_calendar_not_connected" }, { status: 409 });
      const calendars = await listWritableGoogleCalendars(userId);
      if (!calendars.some(calendar => calendar.id === calendarId)) {
        return NextResponse.json({ error: "Calendario Google non disponibile o non scrivibile" }, { status: 400 });
      }
      await prisma.googleCalendarConnection.update({ where: { userId }, data: { calendarId } });
      await prisma.googleCalendarDelivery.updateMany({
        where: { userId, status: "failed", lastError: "google_calendar_not_found" },
        data: { status: "pending", attempts: 0, nextAttemptAt: new Date(), lastError: null },
      });
      scheduleCalendarDeliveries();
      return NextResponse.json({ selectedCalendarId: calendarId });
    } catch (error) {
      if (isMissingCalendarTargetColumn(error)) {
        return NextResponse.json({ error: "google_calendar_schema_update_required" }, { status: 503 });
      }
      const status = getGoogleErrorStatus(error);
      return status === 401 || status === 403
        ? NextResponse.json({ error: "google_calendar_reconnect_required" }, { status: 409 })
        : NextResponse.json({ error: "Impossibile salvare il calendario Google" }, { status: 502 });
    }
  });
}

function isMissingCalendarTargetColumn(error: unknown): boolean {
  const value = error as { code?: string; message?: string };
  return value.code === "P2022" && (value.message || "").includes("calendarId");
}

function getGoogleErrorStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}