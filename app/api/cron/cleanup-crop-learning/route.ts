import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { deleteExpiredCropLearningSamples } from '../../../../lib/scan-learning-store';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secrets = [process.env.CRON_SECRET, process.env.CRON_SECRET_KEY].filter(
    (value): value is string => Boolean(value),
  );
  const authorization = request.headers.get('authorization');
  if (!secrets.length) return NextResponse.json({ error: 'Cron non configurato.' }, { status: 503 });
  const received = Buffer.from(authorization || '');
  const authorized = secrets.some(secret => {
    const expected = Buffer.from(`Bearer ${secret}`);
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
  if (!authorized) {
    return NextResponse.json({ error: 'Non autorizzato.' }, { status: 401 });
  }
  try {
    const deleted = await deleteExpiredCropLearningSamples();
    if (deleted.remainingPairs) {
      return NextResponse.json({ ok: false, deleted }, { status: 503 });
    }
    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    console.error('[cron/cleanup-crop-learning] Cleanup failed:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Pulizia degli esempi di ritaglio non riuscita.' }, { status: 500 });
  }
}
