import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/auth-helpers";

export async function POST(request: NextRequest) {
  return withAuth(async (userId) => {
    try {
      const body = await request.json();
      const currentPassword = (body?.currentPassword || "").toString();
      const newPassword = (body?.newPassword || "").toString();

      if (!currentPassword || !newPassword) {
        return NextResponse.json(
          { error: "Password attuale e nuova password sono obbligatorie" },
          { status: 400 },
        );
      }

      if (newPassword.length < 8) {
        return NextResponse.json(
          { error: "La nuova password deve contenere almeno 8 caratteri" },
          { status: 400 },
        );
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
      }

      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        user.password,
      );

      if (!isCurrentPasswordValid) {
        return NextResponse.json(
          { error: "Password attuale non corretta" },
          { status: 400 },
        );
      }

      const sameAsCurrent = await bcrypt.compare(newPassword, user.password);
      if (sameAsCurrent) {
        return NextResponse.json(
          { error: "La nuova password deve essere diversa da quella attuale" },
          { status: 400 },
        );
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      });

      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error("[API /account/password POST] Error updating password:", error);
      return NextResponse.json(
        { error: "Errore durante l'aggiornamento della password" },
        { status: 500 },
      );
    }
  });
}
