import sharp from "sharp";

export type PosterBounds = { x: number; y: number; width: number; height: number; confidence: number };

export function isPosterPrivacySafe(analysis: string): boolean {
  const responseLines = analysis.split("\n").map(value => value.trim()).filter(Boolean);
  const lines = responseLines.filter(value => value.startsWith("POSTER_PRIVACY:"));
  if (lines.length !== 1 || responseLines.at(-1) !== lines[0]) return false;
  try {
    const result = JSON.parse(lines[0].slice(lines[0].indexOf(":") + 1));
    return result?.safe === true && Number.isFinite(result.confidence) && result.confidence >= 0.9 && result.confidence <= 1;
  } catch {
    return false;
  }
}

export function parsePosterBounds(analysis: string): PosterBounds | null {
  const lines = analysis.split("\n").filter(value => value.trim().startsWith("POSTER_BOUNDS:"));
  if (lines.length !== 1) return null;
  const line = lines[0];
  try {
    const bounds = JSON.parse(line.slice(line.indexOf(":") + 1)) as PosterBounds | null;
    if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height, bounds.confidence].every(Number.isFinite)) return null;
    if (bounds.confidence < 0.8 || bounds.confidence > 1 || bounds.x < 0 || bounds.y < 0 ||
      bounds.width <= 0 || bounds.height <= 0 || bounds.x + bounds.width > 1 || bounds.y + bounds.height > 1 ||
      bounds.width * bounds.height < 0.12) return null;
    return bounds;
  } catch {
    return null;
  }
}

export async function cropPosterPreview(file: File, analysis: string, preserveResolution = false): Promise<string | undefined> {
  const bounds = parsePosterBounds(analysis);
  if (!bounds) return undefined;
  try {
    const source = await sharp(Buffer.from(await file.arrayBuffer())).rotate().toBuffer({ resolveWithObject: true });
    const left = Math.ceil(bounds.x * source.info.width);
    const top = Math.ceil(bounds.y * source.info.height);
    const right = Math.min(source.info.width, Math.floor((bounds.x + bounds.width) * source.info.width));
    const bottom = Math.min(source.info.height, Math.floor((bounds.y + bounds.height) * source.info.height));
    const crop = sharp(source.data).extract({ left, top, width: right - left, height: bottom - top });
    if (!preserveResolution) crop.resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true });
    const cropped = await crop
      .jpeg({ quality: preserveResolution ? 95 : 85 })
      .toBuffer();
    return `data:image/jpeg;base64,${cropped.toString("base64")}`;
  } catch {
    return undefined;
  }
}