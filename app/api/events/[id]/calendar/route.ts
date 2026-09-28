import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/auth-helpers";
import { createMailTransport, getMailFrom } from "@/lib/mailer";
import { buildEventIcs } from "../../../../../lib/calendar-ics";
import { generateUniqueSlug } from "../../../../../lib/slug-utils";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(async (userId) => {
    try {
      const { id } = await params;
      const eventId = Number(id);
      if (!/^\d+$/.test(id) || !Number.isSafeInteger(eventId)) {
        return NextResponse.json({ error: "ID evento non valido" }, { status: 400 });
      }

      let calendarEmail: string | null = null;
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { calendarEmail: true },
        });
        calendarEmail = user?.calendarEmail ?? null;
      } catch (error: any) {
        const message = String(error?.message || "");
        if (
          error?.code === "P2022" ||
          error?.code === "P2021" ||
          message.includes("calendarEmail") ||
          message.includes("does not exist") ||
          message.includes("column")
        ) {
          calendarEmail = null;
        } else {
          throw error;
        }
      }

      if (!calendarEmail) {
        return NextResponse.json(
          { error: "Imposta un'email calendario nel tuo profilo" },
          { status: 400 },
        );
      }

      const event = await prisma.event.findUnique({ where: { id: eventId } });
      if (!event) {
        return NextResponse.json({ error: "Evento non trovato" }, { status: 404 });
      }

      const baseUrl = (process.env.NEXTAUTH_URL || request.nextUrl.origin).replace(/\/$/, "");
      const eventUrl = `${baseUrl}/events/${generateUniqueSlug(event.title, event.id)}`;

      const ics = buildEventIcs(event, { url: eventUrl });
      if (!ics) {
        return NextResponse.json({ error: "Data evento non valida" }, { status: 422 });
      }

      const transporter = createMailTransport();
      if (!transporter) {
        return NextResponse.json({ error: "Invio email non configurato" }, { status: 503 });
      }

      const when = [event.date, event.time].filter(Boolean).join(" ");
      await transporter.sendMail({
        from: getMailFrom(),
        to: calendarEmail,
        subject: `📅 ${event.title}`,
        text: `${event.title}\n${when}\n${event.location || ""}\n\nApri l'allegato per salvare l'evento nel tuo calendario.\n${eventUrl}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
            <h2>${escapeHtml(event.title)}</h2>
            <p>📅 ${escapeHtml(when)}<br/>📍 ${escapeHtml(event.location || "")}</p>
            <p>Apri l'allegato <strong>evento.ics</strong> per salvare l'evento nel tuo calendario.</p>
            <p><a href="${escapeHtml(eventUrl)}">Vedi l'evento su EventScanner</a></p>
          </div>
        `,
        icalEvent: {
          filename: "evento.ics",
          method: "PUBLISH",
          content: ics,
        },
      });

      return NextResponse.json({ ok: true, sentTo: calendarEmail });
    } catch (error) {
      console.error("[API /events/[id]/calendar POST] Error:", error);
      return NextResponse.json(
        { error: "Errore durante l'invio dell'evento al calendario" },
        { status: 500 },
      );
    }
  });
}
