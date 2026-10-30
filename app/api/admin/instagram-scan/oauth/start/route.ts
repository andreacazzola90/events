import { NextResponse } from 'next/server';
import { withAuth } from '../../../../../lib/auth-helpers';
import { prisma } from '../../../../../lib/prisma';
import {
  INSTAGRAM_OAUTH_STATE_COOKIE, instagramAppOrigin, instagramOAuthUrl, instagramScanConfigured, newInstagramOAuthState,
} from '../../../../../../lib/instagram-scan-connection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return withAuth(async userId => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, type: true } });
    if (user?.role !== 'admin' && user?.type !== 'admin') return NextResponse.json({ error: 'Accesso negato' }, { status: 403 });
    if (!instagramScanConfigured()) {
      return NextResponse.json({ error: 'instagram_not_configured' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    const state = newInstagramOAuthState();
    const response = NextResponse.redirect(instagramOAuthUrl(state), 302);
    response.headers.set('Cache-Control', 'no-store');
    response.cookies.set(INSTAGRAM_OAUTH_STATE_COOKIE, `${userId}.${state}`, {
      httpOnly: true, sameSite: 'lax', secure: instagramAppOrigin().startsWith('https:'),
      path: '/api/admin/instagram-scan/oauth', maxAge: 600,
    });
    return response;
  });
}
