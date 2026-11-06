CREATE TABLE "CronJobRun" (
    "id" SERIAL NOT NULL,
    "jobKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "resultJson" TEXT,

    CONSTRAINT "CronJobRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CronJobRun_jobKey_key" ON "CronJobRun"("jobKey");
