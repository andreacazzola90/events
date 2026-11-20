CREATE TABLE "EventCreationJob" (
    "id" UUID NOT NULL,
    "ownerId" INTEGER,
    "secretHash" TEXT,
    "inputHash" TEXT NOT NULL,
    "quotaKey" TEXT NOT NULL,
    "input" BYTEA,
    "mimeType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "leaseToken" TEXT,
    "outcome" JSONB,
    "cachePending" BOOLEAN NOT NULL DEFAULT false,
    "inputExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventCreationJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EventCreationJob_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- The server uses its existing Prisma connection; this table has no client API.
ALTER TABLE "EventCreationJob" ENABLE ROW LEVEL SECURITY;
CREATE INDEX "EventCreationJob_status_nextAttemptAt_idx" ON "EventCreationJob"("status", "nextAttemptAt");
CREATE INDEX "EventCreationJob_status_leaseUntil_idx" ON "EventCreationJob"("status", "leaseUntil");
CREATE INDEX "EventCreationJob_ownerId_createdAt_idx" ON "EventCreationJob"("ownerId", "createdAt");
CREATE INDEX "EventCreationJob_quotaKey_createdAt_idx" ON "EventCreationJob"("quotaKey", "createdAt");
CREATE INDEX "EventCreationJob_inputExpiresAt_idx" ON "EventCreationJob"("inputExpiresAt");
CREATE INDEX "EventCreationJob_createdAt_idx" ON "EventCreationJob"("createdAt");
