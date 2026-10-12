CREATE TABLE "EventMedia" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventMedia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventMedia_storagePath_key" ON "EventMedia"("storagePath");
CREATE INDEX "EventMedia_eventId_position_idx" ON "EventMedia"("eventId", "position");
ALTER TABLE "EventMedia" ADD CONSTRAINT "EventMedia_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;