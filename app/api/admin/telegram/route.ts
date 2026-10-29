import { NextResponse } from 'next/server';
import { withAuth } from '../../../lib/auth-helpers';
import { prisma } from '../../../lib/prisma';
import { getTelegramAdminStatus, mutateTelegramAdmin } from '../../../../lib/telegram-store';
import { TelegramError } from '../../../../lib/telegram-connection';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };

function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof TelegramError ? error.code : 'telegram_operation_failed' }, {
    status: error instanceof TelegramError ? error.status : 503, headers,
  });
}

export async function GET() {
  return withAuth(async userId => {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, type: true } });
      if (user?.role !== 'admin' && user?.type !== 'admin') return NextResponse.json({ error: 'Accesso negato' }, { status: 403, headers });
      return NextResponse.json(await getTelegramAdminStatus(userId), { headers });
    }
    catch (error) { return failure(error); }
  });
}

export async function POST(request: Request) {
  return withAuth(async userId => {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, type: true } });
      if (user?.role !== 'admin' && user?.type !== 'admin') return NextResponse.json({ error: 'Accesso negato' }, { status: 403, headers });
      return NextResponse.json(await mutateTelegramAdmin(request, userId), { headers });
    }
    catch (error) { return failure(error); }
  });
}