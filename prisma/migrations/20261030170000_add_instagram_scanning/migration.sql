CREATE TABLE "InstagramScanConnection" (
  "id" TEXT NOT NULL, "userId" INTEGER NOT NULL, "igUserId" TEXT NOT NULL, "username" TEXT NOT NULL,
  "encryptedToken" TEXT, "tokenExpiresAt" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT 'active', "lastError" TEXT,
  "lastRunAt" TIMESTAMP(3), "lastVisited" INTEGER NOT NULL DEFAULT 0, "lastPublished" INTEGER NOT NULL DEFAULT 0,
  "lastDuplicates" INTEGER NOT NULL DEFAULT 0, "lastDiscarded" INTEGER NOT NULL DEFAULT 0, "lastFailed" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstagramScanConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InstagramScanConnection_userId_key" ON "InstagramScanConnection"("userId");
CREATE TABLE "InstagramScanSource" (
  "id" TEXT NOT NULL, "connectionId" TEXT NOT NULL, "username" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "consentedAt" TIMESTAMP(3), "lastError" TEXT, "lastScannedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstagramScanSource_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InstagramScanSource_connectionId_username_key" ON "InstagramScanSource"("connectionId", "username");
CREATE INDEX "InstagramScanSource_isActive_lastScannedAt_idx" ON "InstagramScanSource"("isActive", "lastScannedAt");
CREATE TABLE "InstagramScanItem" (
  "id" TEXT NOT NULL, "connectionId" TEXT NOT NULL, "mediaId" TEXT NOT NULL, "kind" TEXT NOT NULL, "sourceUsername" TEXT,
  "status" TEXT NOT NULL DEFAULT 'processing', "attempts" INTEGER NOT NULL DEFAULT 1, "publishedCount" INTEGER NOT NULL DEFAULT 0, "discardedCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstagramScanItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InstagramScanItem_connectionId_mediaId_key" ON "InstagramScanItem"("connectionId", "mediaId");
CREATE INDEX "InstagramScanItem_status_idx" ON "InstagramScanItem"("status");
CREATE TABLE "InstagramPublication" (
  "fingerprint" TEXT NOT NULL, "itemId" TEXT, "eventId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InstagramPublication_pkey" PRIMARY KEY ("fingerprint")
);
CREATE INDEX "InstagramPublication_itemId_idx" ON "InstagramPublication"("itemId");
ALTER TABLE "InstagramScanConnection" ADD CONSTRAINT "InstagramScanConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstagramScanSource" ADD CONSTRAINT "InstagramScanSource_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "InstagramScanConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstagramScanItem" ADD CONSTRAINT "InstagramScanItem_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "InstagramScanConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstagramPublication" ADD CONSTRAINT "InstagramPublication_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InstagramScanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InstagramPublication" ADD CONSTRAINT "InstagramPublication_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
