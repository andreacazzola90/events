export type CropBox = { x: number; y: number; width: number; height: number };
export type CropSample = { width: number; height: number; x: number; y: number; w: number; h: number };
export type LearnedCropProfile = { box: CropBox; samples: number; consistent: boolean };

const MAX_SIDE = 10_000;
const CONSISTENCY_TOLERANCE = 0.03;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Validates a manual crop submitted by the browser: source pixel size plus a 0..1 box inside it. */
export function parseCropSample(value: unknown): CropSample | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const { width, height, x, y, w, h } = input;
  if (![width, height, x, y, w, h].every(finite)) return null;
  const sample = { width: Math.round(width as number), height: Math.round(height as number), x: x as number, y: y as number, w: w as number, h: h as number };
  if (sample.width < 64 || sample.height < 64 || sample.width > MAX_SIDE || sample.height > MAX_SIDE) return null;
  if (sample.x < 0 || sample.y < 0 || sample.w <= 0 || sample.h <= 0 || sample.x + sample.w > 1.0001 || sample.y + sample.h > 1.0001) return null;
  // A crop that keeps almost everything or almost nothing teaches nothing useful.
  const area = sample.w * sample.h;
  if (area < 0.08 || area > 0.97) return null;
  return sample;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Screenshots with the same pixel size usually come from the same phone and app, so their UI bars sit in the same place.
 * The profile is "consistent" when at least two recent manual crops agree within a few percent on every edge.
 */
export function learnedCropProfile(samples: CropSample[]): LearnedCropProfile | null {
  const recent = samples.slice(0, 7);
  if (!recent.length) return null;
  const box = {
    x: median(recent.map(sample => sample.x)),
    y: median(recent.map(sample => sample.y)),
    width: median(recent.map(sample => sample.w)),
    height: median(recent.map(sample => sample.h)),
  };
  const edges = (sample: { x: number; y: number; w: number; h: number }) => [sample.x, sample.y, sample.x + sample.w, sample.y + sample.h];
  const reference = edges({ x: box.x, y: box.y, w: box.width, h: box.height });
  const agreeing = recent.filter(sample => edges(sample).every((edge, index) => Math.abs(edge - reference[index]) <= CONSISTENCY_TOLERANCE));
  return { box, samples: recent.length, consistent: agreeing.length >= 2 && agreeing.length / recent.length >= 0.6 };
}
