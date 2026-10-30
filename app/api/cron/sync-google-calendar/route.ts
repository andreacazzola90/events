import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth } from "../../../lib/auth-helpers";
import { isGoogleCalendarConfigured, processCalendarDeliveries } from "../../../lib/google-calendar";

export const maxDuration = 60;

async function sync() {
  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json({ error: "Google Calendar non configurato" }, { status: 503 });
  }
  try {
    return NextResponse.json(await processCalendarDeliveries(100));
  } catch {
    return NextResponse.json({ error: "Sincronizzazione calendario non riuscita" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const secrets = [process.env.CRON_SECRET, process.env.CRON_SECRET_KEY].filter(
    (value): value is string => Boolean(value),
  );
  if (!secrets.length) return NextResponse.json({ error: "Cron non configurato" }, { status: 503 });
  const received = Buffer.from(request.headers.get("authorization") || "");
  const authorized = secrets.some((secret) => {
    const expected = Buffer.from(`Bearer ${secret}`);
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
  if (!authorized) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  return sync();
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origine non valida" }, { status: 403 });
  }
  return withAdminAuth(sync);
}