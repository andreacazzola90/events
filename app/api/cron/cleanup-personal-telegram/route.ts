import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { cleanupExpiredPersonalTelegramMessages } from '../../../../lib/personal-telegram-scanning';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: 'cron_secret_not_configured' }, { status: 503 });
  const received = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from('Bearer ' + secret);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const cleared = await cleanupExpiredPersonalTelegramMessages();
    return NextResponse.json({ status: 'success', cleared });
  } catch {
    return NextResponse.json({ error: 'personal_telegram_cleanup_failed' }, { status: 503 });
  }
}
