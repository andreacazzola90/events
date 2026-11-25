CREATE TABLE "EventPosterFingerprint" (
    "eventId" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    CONSTRAINT "EventPosterFingerprint_pkey" PRIMARY KEY ("eventId"),
    CONSTRAINT "EventPosterFingerprint_eventId_fkey" FOREIGN KEY ("eventId")
        REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "EventPosterFingerprint_fingerprint_idx" ON "EventPosterFingerprint"("fingerprint");
