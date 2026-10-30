import { NextResponse } from 'next/server';
import { withAuth } from '../../../lib/auth-helpers';
import { prisma } from '../../../lib/prisma';
import { getInstagramScanAdminStatus, mutateInstagramScanAdmin } from '../../../../lib/instagram-scan-store';
import { InstagramScanError } from '../../../../lib/instagram-scan-connection';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };

function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof InstagramScanError ? error.code : 'instagram_operation_failed' }, {
    status: error instanceof InstagramScanError ? error.status : 503, headers,
  });
}

async function isAdmin(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, type: true } });
  return user?.role === 'admin' || user?.type === 'admin';
}

export async function GET() {
  return withAuth(async userId => {
    try {
      if (!await isAdmin(userId)) return NextResponse.json({ error: 'Accesso negato' }, { status: 403, headers });
      return NextResponse.json(await getInstagramScanAdminStatus(userId), { headers });
    }
    catch (error) { return failure(error); }
  });
}

export async function POST(request: Request) {
  return withAuth(async userId => {
    try {
      if (!await isAdmin(userId)) return NextResponse.json({ error: 'Accesso negato' }, { status: 403, headers });
      return NextResponse.json(await mutateInstagramScanAdmin(request, userId), { headers });
    }
    catch (error) { return failure(error); }
  });
}
