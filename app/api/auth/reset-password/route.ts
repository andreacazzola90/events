import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { hashPasswordResetToken } from "../../../lib/password-reset";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = (body?.token || "").toString().trim();
    const password = (body?.password || "").toString();

    if (!token || !password) {
      return NextResponse.json(
        { error: "Token e nuova password sono obbligatori" },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "La nuova password deve contenere almeno 8 caratteri" },
        { status: 400 },
      );
    }

    const tokenHash = hashPasswordResetToken(token);
    const resetToken = await (prisma as any).passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!resetToken) {
      return NextResponse.json(
        { error: "Link di recupero non valido o scaduto" },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: resetToken.email },
    });

    if (!user) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { password: passwordHash },
      }),
      (prisma as any).passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      (prisma as any).passwordResetToken.deleteMany({
        where: {
          email: resetToken.email,
          id: { not: resetToken.id },
        },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /auth/reset-password] Error:", error);
    return NextResponse.json(
      { error: "Errore durante il reset della password" },
      { status: 500 },
    );
  }
}
