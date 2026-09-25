import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Manual middleware (instead of withAuth's wrapper) to avoid ambiguity around
// secure-cookie/runtime detection that caused valid session tokens (correctly
// verified by /api/auth/session) to be rejected here on Vercel.
export default async function proxy(req: NextRequest) {
  // Deriving "secure" from req.nextUrl.protocol is unreliable behind Vercel's
  // internal proxying (it can report the internal protocol, not the public
  // one), causing getToken() to look for the wrong cookie name and always
  // miss the real `__Secure-next-auth.session-token` cookie. Vercel always
  // serves over HTTPS, so key off that instead.
  const secureCookie = !!process.env.VERCEL || req.nextUrl.protocol === 'https:';
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie,
  });

  if (token) {
    return NextResponse.next();
  }

  const signInUrl = new URL('/auth', req.url);
  signInUrl.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(signInUrl);
}

// Protect only routes that require mandatory authentication
export const config = {
  matcher: [
    '/api/favorites/:path*',  // API to manage favorites (requires login)
    '/account/:path*',        // User profile (requires login)
    '/cron/:path*',           // Cron admin page (requires login, admin check in page)
    '/me/:path*',             // Alias profile route (requires login)
  ],
};