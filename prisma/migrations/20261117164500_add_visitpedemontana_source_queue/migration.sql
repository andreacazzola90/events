ALTER TABLE "CronJobRun"
  ADD COLUMN "queuePositionAt" TIMESTAMP(3),
  ADD COLUMN "leaseOwner" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "stateVersion" INTEGER NOT NULL DEFAULT 0;

UPDATE "CronJobRun"
SET "leaseExpiresAt" = GREATEST(
  "startedAt" + INTERVAL '6 minutes',
  CURRENT_TIMESTAMP + INTERVAL '6 minutes'
)
WHERE "jobKey" LIKE 'scrape-source:%'
  AND "status" = 'running'
  AND "leaseExpiresAt" IS NULL;

CREATE INDEX "CronJobRun_queuePositionAt_idx" ON "CronJobRun"("queuePositionAt");
