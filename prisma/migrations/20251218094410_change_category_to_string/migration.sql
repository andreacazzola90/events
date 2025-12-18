/*
  Warnings:

  - The `category` column on the `Event` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Event" DROP COLUMN "category",
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'other';

-- DropEnum
DROP TYPE "public"."EventCategory";
