/*
  Warnings:

  - The values [MUSIC,NIGHTLIFE,CULTURE,FOOD,SPORT,FAMILY,OTHER,THEATER,PARTY] on the enum `EventCategory` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "EventCategory_new" AS ENUM ('music', 'nightlife', 'culture', 'food', 'sport', 'family', 'theater', 'party', 'walk', 'other');
ALTER TABLE "public"."Event" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "Event" ALTER COLUMN "category" TYPE "EventCategory_new" USING ("category"::text::"EventCategory_new");
ALTER TYPE "EventCategory" RENAME TO "EventCategory_old";
ALTER TYPE "EventCategory_new" RENAME TO "EventCategory";
DROP TYPE "public"."EventCategory_old";
ALTER TABLE "Event" ALTER COLUMN "category" SET DEFAULT 'other';
COMMIT;

-- AlterTable
ALTER TABLE "Event" ALTER COLUMN "category" SET DEFAULT 'other';
