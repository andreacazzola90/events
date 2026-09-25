import { withAuth } from 'next-auth/middleware';

// Export the proxy function using the new convention
export default withAuth({
  // Must match the secret used in pages/api/auth/[...nextauth].ts explicitly —
  // relying on withAuth's implicit env lookup caused token validation here to
  // diverge from the main NextAuth route handler on Vercel's Edge runtime.
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    authorized: ({ token }) => !!token,
  },
  pages: {
    signIn: '/auth',
  },
});

// Protect only routes that require mandatory authentication
export const config = {
  // Run on the Node.js runtime (not Edge) so this shares the exact same
  // process/env resolution as the API routes — on Vercel, NEXTAUTH_SECRET was
  // not reliably visible to the Edge runtime, causing valid session tokens
  // (correctly verified by /api/auth/session) to be rejected here.
  runtime: 'nodejs',
  matcher: [
    '/api/favorites/:path*',  // API to manage favorites (requires login)
    '/account/:path*',        // User profile (requires login)
    '/cron/:path*',           // Cron admin page (requires login, admin check in page)
    '/me/:path*',             // Alias profile route (requires login)
  ],
};