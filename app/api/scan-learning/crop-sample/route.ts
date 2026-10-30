import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../pages/api/auth/[...nextauth]';
import { parseCropSample } from '../../../../lib/poster-crop-learning';
import { recordCropSample } from '../../../../lib/scan-learning-store';

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  for (const [client, entry] of requestCounts) if (entry.resetAt <= now) requestCounts.delete(client);
  const entry = requestCounts.get(key);
  if (!entry) {
    requestCounts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

/** Stores a manual crop made on an original screenshot, so future screenshots of the same size crop alike. */
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return new NextResponse(null, { status: 403 });
  const client = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(client)) return new NextResponse(null, { status: 429 });
  if (Number(request.headers.get('content-length')) > 1024) return new NextResponse(null, { status: 413 });

  const sample = parseCropSample(await request.json().catch(() => null));
  if (!sample) return NextResponse.json({ error: 'Ritaglio non valido' }, { status: 400 });

  const session = await getServerSession(authOptions as never).catch(() => null) as { user?: { id?: string | number } } | null;
  const userId = Number.parseInt(String(session?.user?.id ?? ''), 10);
  await recordCropSample(sample, Number.isNaN(userId) ? null : userId);
  return new NextResponse(null, { status: 204 });
}
