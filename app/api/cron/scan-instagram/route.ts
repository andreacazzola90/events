import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { scanInstagram } from '../../../../lib/instagram-event-scanning';
import { InstagramScanError } from '../../../../lib/instagram-scan-connection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const RUN_BUDGET_MS = 260_000;

function isAuthorized(header: string | null, secrets: string[]): boolean {
  const received = Buffer.from(header || '');
  return secrets.some(secret => {
    const expected = Buffer.from(`Bearer ${secret}`);
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const secrets = [process.env.CRON_SECRET, process.env.CRON_SECRET_KEY].filter((value): value is string => Boolean(value));
  if (!secrets.length) return NextResponse.json({ error: 'cron_secret_not_configured' }, { status: 503 });
  if (!isAuthorized(request.headers.get('authorization'), secrets)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  try {
    const result = await scanInstagram({ dryRun, deadline: startedAt + RUN_BUDGET_MS });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof InstagramScanError ? error.code : 'instagram_scan_failed';
    console.error('[Instagram Scan] Run failed:', code);
    return NextResponse.json({ status: 'error', dryRun, error: code }, { status: 500 });
  }
}
