import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';

export const authOptions: any = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email e password richiesti');
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email
          }
        });

        if (!user || !user.password) {
          throw new Error('Credenziali non valide');
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isPasswordValid) {
          throw new Error('Credenziali non valide');
        }

        const normalizedEmail = (user.email || '').toLowerCase();
        const shouldBeAdmin =
          normalizedEmail === 'andreacazzola90@gmail.com' ||
          normalizedEmail.startsWith('andreacazzola90@') ||
          normalizedEmail.split('@')[0] === 'andreacazzola90';

        const nextRole = shouldBeAdmin ? 'admin' : ((user as any).role || 'user');
        const nextType = shouldBeAdmin ? 'admin' : ((user as any).type || 'user');

        if (shouldBeAdmin && ((user as any).role !== 'admin' || (user as any).type !== 'admin')) {
          try {
            await prisma.user.update({
              where: { id: user.id },
              data: { role: 'admin', type: 'admin' },
            });
          } catch (syncError) {
            console.warn('[NextAuth] Failed to sync admin role/type for andreacazzola90:', syncError);
          }
        }

        return {
          id: user.id.toString(),
          email: user.email,
          name: (user as any).name || null,
          role: nextRole,
          type: nextType,
        };
      }
    })
  ],
  session: {
    strategy: 'jwt'
  },
  pages: {
    signIn: '/auth',
    error: '/auth/error',
  },
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = user.role;
        token.type = user.type || user.role || 'user';
      }
      return token;
    },
    async session({ session, token }: any) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        (session.user as any).role = token.role as string | undefined;
        (session.user as any).type = (token.type || token.role || 'user') as string;
      }
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default (NextAuth as any)(authOptions);
