import { NextResponse } from 'next/server';
import { withAuth } from '../../../../lib/auth-helpers';
import { prisma } from '../../../../lib/prisma';
import { scanInstagram } from '../../../../../lib/instagram-event-scanning';
import { InstagramScanError, requireInstagramSameOrigin } from '../../../../../lib/instagram-scan-connection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const RUN_BUDGET_MS = 260_000;
const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  return withAuth(async userId => {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, type: true } });
      if (user?.role !== 'admin' && user?.type !== 'admin') return NextResponse.json({ error: 'Accesso negato' }, { status: 403, headers });
      requireInstagramSameOrigin(request);
      const result = await scanInstagram({ dryRun: true, deadline: Date.now() + RUN_BUDGET_MS });
      return NextResponse.json(result, { headers });
    } catch (error) {
      return NextResponse.json({ error: error instanceof InstagramScanError ? error.code : 'instagram_scan_failed' }, {
        status: error instanceof InstagramScanError ? error.status : 503, headers,
      });
    }
  });
}
