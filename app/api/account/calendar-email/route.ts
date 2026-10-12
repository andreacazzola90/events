import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/auth-helpers";
import { normalizeGoogleCalendarEventType } from "../../../../lib/constants";
import { isGoogleCalendarConfigured, scheduleCalendarDeliveries } from "../../../lib/google-calendar";

export async function GET() {
  return withAuth(async (userId) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          calendarEventType: true, googleCalendar: { select: { email: true } },
          calendarDeliveries: { where: { lastError: { not: null } }, orderBy: { createdAt: "desc" }, take: 1, select: { lastError: true } },
        },
      });
      if (!user) {
        return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
      }
      return NextResponse.json({ ...user, googleCalendarConfigured: isGoogleCalendarConfigured() });
    } catch (error: any) {
      const message = String(error?.message || "");
      if (
        error?.code === "P2022" ||
        error?.code === "P2021" ||
        message.includes("does not exist") ||
        message.includes("column")
      ) {
        return NextResponse.json({ error: "Configurazione calendario non aggiornata" }, { status: 503 });
      }
      throw error;
    }
  });
}

export async function PUT(request: NextRequest) {
  return withAuth(async (userId) => {
    try {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || !("calendarEventType" in body)) {
        return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
      }
      const eventType = normalizeGoogleCalendarEventType(body.calendarEventType);
      if (eventType === null) {
        return NextResponse.json({ error: "Tipo di evento Google Calendar non valido" }, { status: 400 });
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: { calendarEventType: eventType },
        select: { calendarEventType: true, googleCalendar: { select: { email: true } } },
      });
      await prisma.googleCalendarDelivery.updateMany({
        where: { userId, status: "failed", lastError: { in: ["google_http_400", "google_http_403", "google_event_time_required", "google_event_type_invalid"] } },
        data: { status: "pending", nextAttemptAt: new Date(), attempts: 0, lastError: null },
      });
      scheduleCalendarDeliveries();

      return NextResponse.json({ ...user, googleCalendarConfigured: isGoogleCalendarConfigured() });
    } catch (error) {
      console.error("[API /account/calendar-email PUT] Error:", error);
      return NextResponse.json(
        { error: "Errore durante il salvataggio dell'email calendario" },
        { status: 500 },
      );
    }
  });
}
