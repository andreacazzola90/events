CREATE TABLE "PosterCropLearningPair" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "w" DOUBLE PRECISION NOT NULL,
    "h" DOUBLE PRECISION NOT NULL,
    "originalPath" TEXT NOT NULL,
    "correctedPath" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosterCropLearningPair_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PosterCropLearningPair_originalPath_key" ON "PosterCropLearningPair"("originalPath");
CREATE UNIQUE INDEX "PosterCropLearningPair_correctedPath_key" ON "PosterCropLearningPair"("correctedPath");
CREATE INDEX "PosterCropLearningPair_userId_width_height_createdAt_idx" ON "PosterCropLearningPair"("userId", "width", "height", "createdAt");
CREATE INDEX "PosterCropLearningPair_createdAt_idx" ON "PosterCropLearningPair"("createdAt");

ALTER TABLE "PosterCropLearningPair"
ADD CONSTRAINT "PosterCropLearningPair_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
