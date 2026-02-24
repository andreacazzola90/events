import { PrismaClient } from '@prisma/client';

// PrismaClient singleton pattern for Next.js
// This prevents multiple instances in development due to hot reloading

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prismaDatabaseUrl = process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL;

export const prisma = globalForPrisma.prisma || new PrismaClient({
  datasources: {
    db: {
      url: prismaDatabaseUrl,
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
