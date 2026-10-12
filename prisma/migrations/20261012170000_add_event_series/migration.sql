CREATE TABLE "EventSeries" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSeries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Event" ADD COLUMN "eventSeriesId" INTEGER;

CREATE UNIQUE INDEX "EventSeries_slug_key" ON "EventSeries"("slug");
CREATE INDEX "EventSeries_isPublished_updatedAt_idx" ON "EventSeries"("isPublished", "updatedAt");
CREATE INDEX "Event_eventSeriesId_date_time_idx" ON "Event"("eventSeriesId", "date", "time");

ALTER TABLE "Event"
ADD CONSTRAINT "Event_eventSeriesId_fkey"
FOREIGN KEY ("eventSeriesId") REFERENCES "EventSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;