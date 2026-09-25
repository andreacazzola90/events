import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashEmailVerificationToken } from "@/lib/email-verification";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = (body?.token || "").toString().trim();

    if (!token) {
      return NextResponse.json({ error: "Token di verifica mancante" }, { status: 400 });
    }

    const tokenHash = hashEmailVerificationToken(token);
    const verificationToken = await (prisma as any).emailVerificationToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!verificationToken) {
      return NextResponse.json(
        { error: "Link di conferma non valido o scaduto" },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({ where: { email: verificationToken.email } });
    if (!user) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      }),
      (prisma as any).emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: { usedAt: new Date() },
      }),
      (prisma as any).emailVerificationToken.deleteMany({
        where: {
          email: verificationToken.email,
          id: { not: verificationToken.id },
        },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /auth/verify-email] Error:", error);
    return NextResponse.json({ error: "Errore durante la verifica dell'email" }, { status: 500 });
  }
}
