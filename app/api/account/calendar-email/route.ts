import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/auth-helpers";
import { normalizeCalendarEmail } from "../../../../lib/calendar-ics";

export async function GET() {
  return withAuth(async (userId) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { calendarEmail: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }
    return NextResponse.json({ calendarEmail: user.calendarEmail });
  });
}

export async function PUT(request: NextRequest) {
  return withAuth(async (userId) => {
    try {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || !("calendarEmail" in body)) {
        return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
      }
      const result = normalizeCalendarEmail(body?.calendarEmail);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: { calendarEmail: result.value },
        select: { calendarEmail: true },
      });

      return NextResponse.json({ calendarEmail: user.calendarEmail });
    } catch (error) {
      console.error("[API /account/calendar-email PUT] Error:", error);
      return NextResponse.json(
        { error: "Errore durante il salvataggio dell'email calendario" },
        { status: 500 },
      );
    }
  });
}
