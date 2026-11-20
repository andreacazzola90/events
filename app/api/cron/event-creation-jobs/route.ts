import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { jobResponse } from '../../../../lib/event-creation-job-access';
import { runEventCreationRecovery } from '../../../../lib/event-creation-worker';

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET_KEY;
  if (!secret) return jobResponse({ error: 'cron_secret_not_configured' }, 503);
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get('authorization') ?? '');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return jobResponse({ error: 'Unauthorized' }, 401);
  }
  return jobResponse(await runEventCreationRecovery());
}
