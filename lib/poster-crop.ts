import sharp from "sharp";

export type PosterBounds = { x: number; y: number; width: number; height: number; confidence: number };

export function parsePosterBounds(analysis: string): PosterBounds | null {
  const line = analysis.split("\n").find(value => value.trim().startsWith("POSTER_BOUNDS:"));
  if (!line) return null;
  try {
    const bounds = JSON.parse(line.slice(line.indexOf(":") + 1)) as PosterBounds | null;
    if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height, bounds.confidence].every(Number.isFinite)) return null;
    if (bounds.confidence < 0.9 || bounds.confidence > 1 || bounds.x < 0 || bounds.y < 0 ||
      bounds.width <= 0 || bounds.height <= 0 || bounds.x + bounds.width > 1 || bounds.y + bounds.height > 1 ||
      bounds.width * bounds.height < 0.12 || bounds.width * bounds.height > 0.98) return null;
    return bounds;
  } catch {
    return null;
  }
}

export async function cropPosterPreview(file: File, analysis: string): Promise<string | undefined> {
  const bounds = parsePosterBounds(analysis);
  if (!bounds) return undefined;
  try {
    const source = await sharp(Buffer.from(await file.arrayBuffer())).rotate().toBuffer({ resolveWithObject: true });
    const left = Math.floor(bounds.x * source.info.width);
    const top = Math.floor(bounds.y * source.info.height);
    const right = Math.min(source.info.width, Math.ceil((bounds.x + bounds.width) * source.info.width));
    const bottom = Math.min(source.info.height, Math.ceil((bounds.y + bounds.height) * source.info.height));
    const cropped = await sharp(source.data)
      .extract({ left, top, width: right - left, height: bottom - top })
      .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return `data:image/jpeg;base64,${cropped.toString("base64")}`;
  } catch {
    return undefined;
  }
}