ALTER TABLE "Event"
  ADD COLUMN "endDate" TEXT,
  ADD COLUMN "endTime" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "performerName" TEXT,
  ADD COLUMN "performerType" TEXT,
  ADD COLUMN "organizerUrl" TEXT,
  ADD COLUMN "offerUrl" TEXT,
  ADD COLUMN "offerAvailability" TEXT,
  ADD COLUMN "offerValidFrom" TEXT,
  ADD COLUMN "eventStatus" TEXT NOT NULL DEFAULT 'Scheduled';
