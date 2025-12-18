/*
  Warnings:

  - The `category` column on the `Event` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('MUSIC', 'NIGHTLIFE', 'CULTURE', 'FOOD', 'SPORT', 'FAMILY', 'OTHER');

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "category",
ADD COLUMN     "category" "EventCategory" NOT NULL DEFAULT 'OTHER';
