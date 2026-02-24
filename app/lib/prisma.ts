import { PrismaClient } from '@prisma/client';

// PrismaClient singleton pattern for Next.js
// This prevents multiple instances in development due to hot reloading

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prismaDatabaseUrl = process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL;
const prismaLogs = process.env.PRISMA_LOG_QUERIES === 'true'
  ? ['query', 'error', 'warn']
  : ['error', 'warn'];

export const prisma = globalForPrisma.prisma || new PrismaClient({
  datasources: {
    db: {
      url: prismaDatabaseUrl,
    },
  },
  log: prismaLogs,
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
