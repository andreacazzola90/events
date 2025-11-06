import { withAuth } from 'next-auth/middleware';

// Export the proxy function using the new convention
export default withAuth({
  callbacks: {
    authorized: ({ token }) => !!token,
  },
  pages: {
    signIn: '/auth/signin',
  },
});

// Protect only routes that require mandatory authentication
export const config = {
  matcher: [
    '/api/favorites/:path*',  // API to manage favorites (requires login)
    '/profile/:path*',        // User profile (requires login)
  ],
};