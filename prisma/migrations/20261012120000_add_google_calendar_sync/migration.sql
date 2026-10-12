ALTER TABLE "User" ADD COLUMN "calendarCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "GoogleCalendarConnection" (
    "userId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GoogleCalendarConnection_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "GoogleCalendarDelivery" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "eventId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leasedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    CONSTRAINT "GoogleCalendarDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoogleCalendarDelivery_userId_eventId_key" ON "GoogleCalendarDelivery"("userId", "eventId");
CREATE INDEX "GoogleCalendarDelivery_status_nextAttemptAt_idx" ON "GoogleCalendarDelivery"("status", "nextAttemptAt");
ALTER TABLE "GoogleCalendarConnection" ADD CONSTRAINT "GoogleCalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoogleCalendarDelivery" ADD CONSTRAINT "GoogleCalendarDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoogleCalendarDelivery" ADD CONSTRAINT "GoogleCalendarDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;