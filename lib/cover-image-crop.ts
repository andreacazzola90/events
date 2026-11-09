export type CoverImageCrop = { x: number; y: number; width: number; height: number };

export function isCoverImageCrop(value: unknown): value is CoverImageCrop {
  if (!value || typeof value !== 'object') return false;
  const crop = value as Partial<CoverImageCrop>;
  const { x, y, width, height } = crop;
  return typeof x === 'number' && Number.isFinite(x)
    && typeof y === 'number' && Number.isFinite(y)
    && typeof width === 'number' && Number.isFinite(width)
    && typeof height === 'number' && Number.isFinite(height)
    && x >= 0
    && y >= 0
    && width > 0
    && height > 0
    && x + width <= 1.001
    && y + height <= 1.001;
}
