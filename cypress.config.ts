import { defineConfig } from 'cypress';
import dotenv from 'dotenv';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient();

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    setupNodeEvents(on) {
      // Add custom task for logging performance metrics
      on('task', {
        log(message) {
          console.log(message);
          return null;
        },
        // Seeds a real user directly in the DB so login tests exercise the
        // actual NextAuth credentials flow end-to-end.
        async 'db:seedUser'({ email, password }: { email: string; password: string }) {
          const hashedPassword = await bcrypt.hash(password, 10);
          await prisma.user.upsert({
            where: { email },
            update: { password: hashedPassword },
            create: { email, password: hashedPassword, role: 'user', type: 'user' },
          });
          return null;
        },
        // Cleans up test users created by db:seedUser so runs stay repeatable.
        async 'db:deleteUser'(email: string) {
          await (prisma as any).emailVerificationToken.deleteMany({ where: { email } }).catch(() => null);
          await (prisma as any).passwordResetToken.deleteMany({ where: { email } }).catch(() => null);
          await prisma.user.deleteMany({ where: { email } }).catch(() => null);
          return null;
        },
        // Returns whether a user's email has been marked verified.
        async 'db:isEmailVerified'(email: string) {
          const user = await prisma.user.findUnique({ where: { email } });
          return Boolean((user as any)?.emailVerifiedAt);
        },
        // Seeds a known, non-expired verification token so tests can exercise
        // the verify-email endpoint without depending on real mail delivery.
        async 'db:seedVerificationToken'({ email, token }: { email: string; token: string }) {
          const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
          await (prisma as any).emailVerificationToken.create({
            data: { email, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
          });
          return null;
        },
      });
    },
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
  },
});
