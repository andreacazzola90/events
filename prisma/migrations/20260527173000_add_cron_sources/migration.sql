-- CreateTable
CREATE TABLE "CronSource" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "listUrl" TEXT NOT NULL,
    "scheduleCron" TEXT NOT NULL DEFAULT '0 4 * * *',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Rome',
    "eventLinkSelector" TEXT NOT NULL DEFAULT 'a[href]',
    "nextPageSelector" TEXT,
    "includePattern" TEXT,
    "excludePattern" TEXT,
    "waitMs" INTEGER NOT NULL DEFAULT 3000,
    "requestTimeoutMs" INTEGER NOT NULL DEFAULT 60000,
    "maxPages" INTEGER NOT NULL DEFAULT 10,
    "maxLinksPerRun" INTEGER NOT NULL DEFAULT 200,
    "renderJs" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CronSource_pkey" PRIMARY KEY ("id")
);
