import { NextResponse } from 'next/server';
import { withAuth } from '../../../lib/auth-helpers';
import { prisma } from '../../../lib/prisma';
import { boundedJson, callMessagingWorker, MessagingError, parseMessagingCommand, requireMessagingOrigin, safeMessagingError } from '../../../../lib/personal-messaging';
import { personalMessagingSyncRevision, personalTelegramAdminScanStatus, revokePersonalTelegramGrant, syncPersonalMessagingStatus } from '../../../../lib/personal-telegram-scanning';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store, private', 'Vary': 'Cookie', 'X-Content-Type-Options': 'nosniff' };
const requests = new Map<number, { count: number; until: number }>();
async function handle(request: Request, mutate: boolean) {
  return withAuth(async owner => {
    try {
      const user = await prisma.user.findUnique({ where: { id: owner }, select: { role: true, type: true } });
      if (user?.role !== 'admin' && user?.type !== 'admin') return NextResponse.json({ error: 'Accesso negato' }, { status: 403, headers });
      const now = Date.now();
      for (const [key, request] of requests) if (request.until <= now) requests.delete(key);
      const limit = requests.get(owner) || { count: 0, until: now + 60000 };
      if (requests.size > 2000 || ++limit.count > 90) throw new MessagingError('rate_limited', 429);
      requests.set(owner, limit);
      if (mutate) requireMessagingOrigin(request);
      const url = new URL(request.url);
      if (!mutate && ([...url.searchParams.keys()].some(key => key !== 'platform') || url.searchParams.getAll('platform').length !== 1)) throw new MessagingError('invalid_payload');
      const command = parseMessagingCommand(mutate ? await boundedJson(request) : { action: 'status', platform: url.searchParams.get('platform') });
      if (mutate && command.platform === 'telegram' && ['start', 'disconnect'].includes(command.action)) {
        await revokePersonalTelegramGrant(owner);
      }
      if (mutate && command.platform === 'telegram' && command.action === 'pause') {
        await revokePersonalTelegramGrant(owner, command.source);
      }
      const sync = command.platform === 'telegram' && ['status', 'authorize', 'pause', 'disconnect', 'start'].includes(command.action);
      const expectedRevision = sync ? await personalMessagingSyncRevision(owner) : undefined;
      const result = await callMessagingWorker(owner, command);
      if (sync) {
        await syncPersonalMessagingStatus(owner, result, { authorized: command.action === 'authorize', expectedRevision });
      }
      if (command.platform === 'telegram') {
        return NextResponse.json({ ...result, scanning: await personalTelegramAdminScanStatus(owner) }, { headers });
      }
      return NextResponse.json(result, { headers });
    } catch (error) {
      return NextResponse.json({ error: safeMessagingError(error instanceof MessagingError ? error.code : undefined) }, { status: error instanceof MessagingError ? error.status : 503, headers });
    }
  });
}
export async function GET(request: Request) { return handle(request, false); }
export async function POST(request: Request) { return handle(request, true); }