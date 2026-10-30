import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '../../../../../lib/auth-helpers';
import { prisma } from '../../../../../lib/prisma';
import {
  INSTAGRAM_OAUTH_STATE_COOKIE, InstagramScanError, exchangeInstagramCode, findInstagramBusinessAccount, instagramAppOrigin, instagramStateMatches,
} from '../../../../../../lib/instagram-scan-connection';
import { saveInstagramConnection } from '../../../../../../lib/instagram-scan-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function finish(result: string) {
  let origin: string;
  try { origin = instagramAppOrigin(); } catch { return NextResponse.json({ error: 'instagram_origin_not_configured' }, { status: 503 }); }
  const response = NextResponse.redirect(`${origin}/cron?instagram=${encodeURIComponent(result)}`, 303);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.cookies.set(INSTAGRAM_OAUTH_STATE_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/api/admin/instagram-scan/oauth', maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  return withAuth(async userId => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, type: true } });
    if (user?.role !== 'admin' && user?.type !== 'admin') return NextResponse.json({ error: 'Accesso negato' }, { status: 403 });
    const params = request.nextUrl.searchParams;
    const [cookieUser, expectedState] = (request.cookies.get(INSTAGRAM_OAUTH_STATE_COOKIE)?.value || '').split('.');
    if (cookieUser !== String(userId) || !instagramStateMatches(params.get('state'), expectedState)) return finish('state_invalid');
    if (params.get('error')) return finish('denied');
    const code = params.get('code');
    if (!code) return finish('oauth_failed');
    try {
      const signal = AbortSignal.timeout(25_000);
      const { token, expiresAt } = await exchangeInstagramCode(code, signal);
      const account = await findInstagramBusinessAccount(token, signal);
      await saveInstagramConnection(userId, { ...account, token, expiresAt });
      return finish('connected');
    } catch (error) {
      const known = error instanceof InstagramScanError ? error.code : 'instagram_oauth_failed';
      return finish(known === 'instagram_business_account_missing' ? 'no_business_account' : known === 'instagram_key_not_configured' ? 'not_configured' : 'oauth_failed');
    }
  });
}
