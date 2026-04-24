import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/auth-helpers";

export async function GET(_request: NextRequest) {
  return withAuth(async (userId) => {
    try {
      const favorites = await prisma.favorite.findMany({
        where: { userId },
        include: { event: true },
        orderBy: { createdAt: "desc" },
      });

      const events = favorites.map((fav) => fav.event);
      return NextResponse.json(events);
    } catch (error) {
      console.error("[API /favorites GET] Error fetching favorites:", error);
      return NextResponse.json(
        { error: "Errore durante il recupero dei preferiti" },
        { status: 500 },
      );
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(async (userId) => {
    try {
      const body = await request.json();
      const eventId = parseInt((body?.eventId ?? "").toString(), 10);
      if (!eventId || Number.isNaN(eventId)) {
        return NextResponse.json(
          { error: "eventId non valido" },
          { status: 400 },
        );
      }

      // Crea il preferito se non esiste già
      await prisma.favorite.upsert({
        where: {
          userId_eventId: {
            userId,
            eventId,
          },
        },
        update: {},
        create: {
          userId,
          eventId,
        },
      });

      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error("[API /favorites POST] Error adding favorite:", error);
      return NextResponse.json(
        { error: "Errore durante l'aggiunta ai preferiti" },
        { status: 500 },
      );
    }
  });
}

export async function DELETE(request: NextRequest) {
  return withAuth(async (userId) => {
    try {
      const body = await request.json();
      const eventId = parseInt((body?.eventId ?? "").toString(), 10);
      if (!eventId || Number.isNaN(eventId)) {
        return NextResponse.json(
          { error: "eventId non valido" },
          { status: 400 },
        );
      }

      await prisma.favorite.deleteMany({
        where: {
          userId,
          eventId,
        },
      });

      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error("[API /favorites DELETE] Error removing favorite:", error);
      return NextResponse.json(
        { error: "Errore durante la rimozione dai preferiti" },
        { status: 500 },
      );
    }
  });
}
