-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'user';
