import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildPasswordResetUrl,
  createPasswordResetToken,
  sendPasswordResetEmail,
} from "../../../lib/password-reset";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = (body?.email || "").toString().trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { error: "Email obbligatoria" },
        { status: 400 },
      );
    }

    const genericMessage =
      "Se esiste un account associato a questa email, riceverai un link per reimpostare la password.";

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ ok: true, message: genericMessage });
    }

    await (prisma as any).passwordResetToken.deleteMany({
      where: { email },
    });

    const { token, tokenHash, expiresAt } = createPasswordResetToken();

    await (prisma as any).passwordResetToken.create({
      data: {
        email,
        tokenHash,
        expiresAt,
      },
    });

    const origin = new URL(request.url).origin;
    const resetUrl = buildPasswordResetUrl(origin, token);
    let mailResult: { delivered: boolean; previewUrl: string | null } = {
      delivered: false,
      previewUrl: null,
    };

    try {
      mailResult = await sendPasswordResetEmail({ to: email, resetUrl });
    } catch (mailError) {
      // Do not fail the endpoint if the mail provider is unavailable.
      console.error("[API /auth/forgot-password] Mail error:", mailError);
    }

    return NextResponse.json({
      ok: true,
      message: genericMessage,
      previewUrl: mailResult.previewUrl,
    });
  } catch (error) {
    console.error("[API /auth/forgot-password] Error:", error);
    return NextResponse.json(
      { error: "Errore durante la richiesta di recupero password" },
      { status: 500 },
    );
  }
}
