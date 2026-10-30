CREATE TABLE "InstagramStorySettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "igUserId" TEXT,
    "accessTokenEncrypted" TEXT,
    "graphApiVersion" TEXT NOT NULL DEFAULT 'v22.0',
    "autoPublish" BOOLEAN NOT NULL DEFAULT false,
    "publishDays" INTEGER[] DEFAULT ARRAY[3]::INTEGER[],
    "publishHour" INTEGER NOT NULL DEFAULT 20,
    "lastRunSlot" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "lastMediaId" TEXT,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramStorySettings_pkey" PRIMARY KEY ("id")
);
