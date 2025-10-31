import { withAuth } from 'next-auth/middleware';

// Esporta direttamente la funzione middleware
export default withAuth({
  callbacks: {
    authorized: ({ token }) => !!token,
  },
  pages: {
    signIn: '/auth/signin',
  },
});

// Proteggi solo le route che richiedono autenticazione obbligatoria
export const config = {
  matcher: [
    '/api/favorites/:path*',  // API per gestire i preferiti (richiede login)
    '/profile/:path*',         // Profilo utente (richiede login)
  ],
};