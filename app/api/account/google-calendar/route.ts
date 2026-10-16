import { randomBytes } from "node:crypto";
import { CodeChallengeMethod } from "google-auth-library";
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "../../../lib/auth-helpers";
import {
  disconnectGoogleCalendar, encryptCalendarToken, getGoogleCalendarClient,
  GOOGLE_CALENDAR_COOKIE, GOOGLE_CALENDAR_LIST_SCOPE, GOOGLE_CALENDAR_SCOPE, isGoogleCalendarConfigured,
} from "../../../lib/google-calendar";

export async function POST(request: NextRequest) {
  return withAuth(async userId => {
    if (request.headers.get("origin") !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Origine non valida" }, { status: 403 });
    }
    if (!isGoogleCalendarConfigured()) {
      return NextResponse.json({ error: "Collegamento Google Calendar non ancora configurato" }, { status: 503 });
    }
    try {
      const client = getGoogleCalendarClient(request.nextUrl.origin);
      const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
      const state = randomBytes(32).toString("hex");
      const response = NextResponse.json({ url: client.generateAuthUrl({
        access_type: "offline", prompt: "consent select_account",
        scope: ["openid", "email", GOOGLE_CALENDAR_SCOPE, GOOGLE_CALENDAR_LIST_SCOPE],
        state,
        code_challenge: codeChallenge, code_challenge_method: CodeChallengeMethod.S256,
      }) });
      response.cookies.set(GOOGLE_CALENDAR_COOKIE, encryptCalendarToken(JSON.stringify({
        state, codeVerifier, expiresAt: Date.now() + 600_000,
      }), userId), {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600,
      });
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch {
      return NextResponse.json({ error: "Impossibile avviare il collegamento Google" }, { status: 500 });
    }
  });
}

export async function DELETE(request: NextRequest) {
  return withAuth(async userId => {
    if (request.headers.get("origin") !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Origine non valida" }, { status: 403 });
    }
    try {
      await disconnectGoogleCalendar(userId);
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: "Impossibile scollegare Google Calendar" }, { status: 500 });
    }
  });
}