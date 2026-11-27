CREATE TABLE "CronJobSetting" (
    "jobKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CronJobSetting_pkey" PRIMARY KEY ("jobKey")
);
