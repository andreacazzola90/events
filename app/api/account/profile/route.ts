import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/auth-helpers";

export async function GET() {
  return withAuth(async (userId) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }

    return NextResponse.json(user);
  });
}

export async function PUT(request: NextRequest) {
  return withAuth(async (userId) => {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || typeof body.name !== "string") {
      return NextResponse.json({ error: "Nome non valido" }, { status: 400 });
    }

    const name = body.name.trim();
    if (!name || name.length > 100) {
      return NextResponse.json(
        { error: "Il nome deve contenere da 1 a 100 caratteri" },
        { status: 400 },
      );
    }

    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: { name },
        select: { name: true, email: true },
      });

      return NextResponse.json(user);
    } catch (error) {
      console.error("[API /account/profile PUT] Error updating profile:", error);
      return NextResponse.json(
        { error: "Errore durante l'aggiornamento del profilo" },
        { status: 500 },
      );
    }
  });
}