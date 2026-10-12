import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "../../../../lib/auth-helpers";
import { prisma } from "../../../../lib/prisma";
import {
  decryptCalendarToken, encryptCalendarToken, getGoogleCalendarClient,
  GOOGLE_CALENDAR_COOKIE, GOOGLE_CALENDAR_LIST_SCOPE, GOOGLE_CALENDAR_SCOPE, scheduleCalendarDeliveries,
} from "../../../../lib/google-calendar";

export async function GET(request: NextRequest) {
  return withAuth(async userId => {
    const finish = (status: string) => {
      const response = NextResponse.redirect(new URL(`/account?googleCalendar=${status}`, process.env.NEXTAUTH_URL || request.nextUrl.origin));
      response.cookies.set(GOOGLE_CALENDAR_COOKIE, "", {
        path: "/", maxAge: 0, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
      });
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("Referrer-Policy", "no-referrer");
      return response;
    };
    try {
      const cookie = request.cookies.get(GOOGLE_CALENDAR_COOKIE)?.value;
      if (!cookie) return finish("invalid_state");
      const saved = JSON.parse(decryptCalendarToken(cookie, userId));
      if (typeof saved.state !== "string" || saved.state !== request.nextUrl.searchParams.get("state") ||
        typeof saved.codeVerifier !== "string" || typeof saved.expiresAt !== "number" || saved.expiresAt < Date.now()) {
        return finish("invalid_state");
      }
      if (request.nextUrl.searchParams.has("error")) return finish("denied");
      const code = request.nextUrl.searchParams.get("code");
      if (!code) return finish("denied");
      const client = getGoogleCalendarClient();
      const { tokens } = await client.getToken({ code, codeVerifier: saved.codeVerifier });
      const grantedScopes = tokens.scope?.split(" ") || [];
      if (!grantedScopes.includes(GOOGLE_CALENDAR_SCOPE) || !grantedScopes.includes(GOOGLE_CALENDAR_LIST_SCOPE)) {
        return finish("missing_scope");
      }
      if (!tokens.id_token || !tokens.refresh_token) return finish("missing_token");
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CALENDAR_CLIENT_ID });
      const identity = ticket.getPayload();
      const email = identity?.email?.trim().toLowerCase();
      if (!email || !identity?.email_verified) return finish("invalid_email");
      const refreshToken = encryptCalendarToken(tokens.refresh_token, userId);
      await prisma.googleCalendarConnection.upsert({
        where: { userId }, create: { userId, email, refreshToken, calendarId: "primary" }, update: { email, refreshToken },
      });
      await prisma.googleCalendarDelivery.updateMany({
        where: { userId, status: { in: ["failed", "pending"] }, lastError: "google_reconnect_required" },
        data: { status: "pending", attempts: 0, nextAttemptAt: new Date(), lastError: null },
      });
      scheduleCalendarDeliveries();
      return finish("connected");
    } catch {
      return finish("failed");
    }
  });
}