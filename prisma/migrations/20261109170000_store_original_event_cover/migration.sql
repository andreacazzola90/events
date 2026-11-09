ALTER TABLE "Event"
  ADD COLUMN "originalImageUrl" TEXT,
  ADD COLUMN "originalImageCropX" DOUBLE PRECISION,
  ADD COLUMN "originalImageCropY" DOUBLE PRECISION,
  ADD COLUMN "originalImageCropWidth" DOUBLE PRECISION,
  ADD COLUMN "originalImageCropHeight" DOUBLE PRECISION;
