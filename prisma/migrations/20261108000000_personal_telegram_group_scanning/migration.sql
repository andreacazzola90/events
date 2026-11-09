ALTER TABLE "PersonalMessagingSource"
  DROP CONSTRAINT "PersonalMessagingSource_kind_check",
  ADD CONSTRAINT "PersonalMessagingSource_kind_check"
    CHECK ("kind" IN ('broadcast', 'newsletter', 'group')),
  ADD COLUMN "workerRevision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "baselineAt" TIMESTAMP(3),
  ADD COLUMN "lastScannedAt" TIMESTAMP(3),
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "messagesSeen" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "messagesDiscarded" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "PersonalMessagingSource_active_lastScannedAt_idx"
  ON "PersonalMessagingSource"("active", "lastScannedAt");

CREATE TABLE "PersonalTelegramScanMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sourceId" TEXT NOT NULL REFERENCES "PersonalMessagingSource"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "providerMessageId" INTEGER NOT NULL,
  "sourceRevision" INTEGER NOT NULL,
  "rawText" TEXT NOT NULL,
  "photoBytes" BYTEA,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseId" TEXT,
  "leasedUntil" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "PersonalTelegramScanMessage_sourceId_providerMessageId_key"
  ON "PersonalTelegramScanMessage"("sourceId", "providerMessageId");
CREATE INDEX "PersonalTelegramScanMessage_status_nextAttemptAt_idx"
  ON "PersonalTelegramScanMessage"("status", "nextAttemptAt");
CREATE INDEX "PersonalTelegramScanMessage_expiresAt_idx"
  ON "PersonalTelegramScanMessage"("expiresAt");

CREATE TABLE "PersonalTelegramScanPublication" (
  "fingerprint" TEXT NOT NULL PRIMARY KEY,
  "messageId" TEXT REFERENCES "PersonalTelegramScanMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "eventId" INTEGER REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PersonalTelegramScanPublication_messageId_idx"
  ON "PersonalTelegramScanPublication"("messageId");
