CREATE TABLE "PersonalMessagingAccount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "platform" TEXT NOT NULL CHECK ("platform" IN ('telegram', 'whatsapp')),
  "status" TEXT NOT NULL DEFAULT 'disconnected',
  "encryptedSession" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "loginExpiresAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "PersonalMessagingAccount_ownerId_platform_key" ON "PersonalMessagingAccount"("ownerId", "platform");
CREATE TABLE "PersonalMessagingSource" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL REFERENCES "PersonalMessagingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "providerId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('broadcast', 'newsletter')),
  "active" BOOLEAN NOT NULL DEFAULT false,
  "consentedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PersonalMessagingSource_consent_check" CHECK (NOT "active" OR ("consentedAt" IS NOT NULL AND "verifiedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "PersonalMessagingSource_accountId_providerId_key" ON "PersonalMessagingSource"("accountId", "providerId");