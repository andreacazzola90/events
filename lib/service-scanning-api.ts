import { NextResponse } from 'next/server';
import { withAuth } from '../app/lib/auth-helpers';
import { prisma } from '../app/lib/prisma';
import { boundedJson, MessagingError, parseServiceScan, requireMessagingOrigin } from './personal-messaging';
import type { Platform } from './personal-messaging';

const headers = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };
const running = new Set<string>();
export async function runServiceScan(
  request: Request, service: string,
  scan: (options: { dryRun: boolean; deadline: number; ownerId: number; platform?: Platform }) => Promise<unknown>,
  personal = false,
) {
  const response = await withAuth(async ownerId => {
    let key: string | undefined;
    try {
      const user = await prisma.user.findUnique({ where: { id: ownerId }, select: { role: true, type: true } });
      if (!Number.isSafeInteger(ownerId) || ownerId < 1 || (user?.role !== 'admin' && user?.type !== 'admin')) return NextResponse.json({ error: 'Accesso negato' }, { status: 403, headers });
      requireMessagingOrigin(request, service === 'instagram'
        ? process.env.INSTAGRAM_SCAN_REDIRECT_ORIGIN || process.env.NEXTAUTH_URL
        : service === 'telegram-bot' ? process.env.TELEGRAM_ADMIN_ORIGIN || process.env.NEXTAUTH_URL : undefined);
      const payload = parseServiceScan(await boundedJson(request), personal);
      const candidate = `${ownerId}:${service}:${payload.platform || ''}`;
      if (running.has(candidate)) throw new MessagingError('rate_limited', 429);
      key = candidate; running.add(key);
      return NextResponse.json(await scan({ ...payload, ownerId, deadline: Date.now() + 260_000 }), { headers });
    } catch (error) {
      return NextResponse.json({ error: error instanceof MessagingError ? error.code : 'service_scan_failed' }, { status: error instanceof MessagingError ? error.status : 503, headers });
    } finally { if (key) running.delete(key); }
  });
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}
