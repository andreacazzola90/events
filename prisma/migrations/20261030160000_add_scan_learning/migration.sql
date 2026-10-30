-- CreateTable
CREATE TABLE "ScanCorrection" (
    "id" SERIAL NOT NULL,
    "field" TEXT NOT NULL,
    "aiValue" TEXT NOT NULL,
    "correctedValue" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosterCropSample" (
    "id" SERIAL NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "w" DOUBLE PRECISION NOT NULL,
    "h" DOUBLE PRECISION NOT NULL,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosterCropSample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScanCorrection_createdAt_idx" ON "ScanCorrection"("createdAt");

-- CreateIndex
CREATE INDEX "PosterCropSample_width_height_createdAt_idx" ON "PosterCropSample"("width", "height", "createdAt");
