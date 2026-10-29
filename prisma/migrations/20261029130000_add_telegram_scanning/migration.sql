CREATE TABLE "TelegramConnection" (
  "id" TEXT NOT NULL, "userId" INTEGER NOT NULL, "botId" TEXT NOT NULL,
  "botUsername" TEXT NOT NULL, "encryptedToken" TEXT, "webhookSecretHash" TEXT,
  "status" TEXT NOT NULL DEFAULT 'connecting', "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelegramConnection_userId_key" ON "TelegramConnection"("userId");
CREATE UNIQUE INDEX "TelegramConnection_botId_key" ON "TelegramConnection"("botId");
CREATE TABLE "TelegramSource" (
  "id" TEXT NOT NULL, "connectionId" TEXT NOT NULL, "chatId" TEXT NOT NULL,
  "title" TEXT NOT NULL, "chatType" TEXT NOT NULL, "publicUsername" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT false, "consentedAt" TIMESTAMP(3), "verifiedAt" TIMESTAMP(3), "lastError" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1, "removedAt" TIMESTAMP(3),
  "lastScannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramSource_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelegramSource_connectionId_chatId_key" ON "TelegramSource"("connectionId", "chatId");
CREATE INDEX "TelegramSource_isActive_lastScannedAt_idx" ON "TelegramSource"("isActive", "lastScannedAt");
CREATE TABLE "TelegramMessage" (
  "id" TEXT NOT NULL, "sourceId" TEXT NOT NULL, "messageId" INTEGER NOT NULL, "updateId" BIGINT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1, "rawText" TEXT, "photoFileId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending', "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "leaseId" TEXT, "leasedUntil" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL, "lastError" TEXT,
  "publishedCount" INTEGER NOT NULL DEFAULT 0, "discardedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelegramMessage_sourceId_messageId_key" ON "TelegramMessage"("sourceId", "messageId");
CREATE INDEX "TelegramMessage_status_nextAttemptAt_idx" ON "TelegramMessage"("status", "nextAttemptAt");
CREATE INDEX "TelegramMessage_expiresAt_idx" ON "TelegramMessage"("expiresAt");
CREATE TABLE "TelegramPublication" (
  "fingerprint" TEXT NOT NULL, "messageId" TEXT, "eventId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramPublication_pkey" PRIMARY KEY ("fingerprint")
);
CREATE INDEX "TelegramPublication_messageId_idx" ON "TelegramPublication"("messageId");
ALTER TABLE "TelegramConnection" ADD CONSTRAINT "TelegramConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramSource" ADD CONSTRAINT "TelegramSource_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "TelegramConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramMessage" ADD CONSTRAINT "TelegramMessage_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "TelegramSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramPublication" ADD CONSTRAINT "TelegramPublication_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "TelegramMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramPublication" ADD CONSTRAINT "TelegramPublication_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;