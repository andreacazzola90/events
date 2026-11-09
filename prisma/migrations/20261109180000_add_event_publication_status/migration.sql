ALTER TABLE "Event"
ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Event_isPublished_date_time_idx" ON "Event"("isPublished", "date", "time");
