import sharp from 'sharp';
import { prisma } from '../app/lib/prisma';
import { diffScanCorrections, formatScanLessons, LEARNED_SCAN_FIELDS, selectScanLessons, verifyScanBaseline, type LearnedScanField } from './scan-learning';
import { learnedCropProfile, parseCropSample, type CropSample, type LearnedCropProfile } from './poster-crop-learning';
import { deletePrivateCropLearningImages, downloadPrivateCropLearningImage, uploadPrivateCropLearningPair } from '../app/lib/supabase';

const LESSON_POOL_SIZE = 300;
const CROP_SAMPLE_MAX_AGE_MS = 180 * 24 * 60 * 60_000;
const MAX_CROP_LEARNING_PAIRS = 3;

/** Prompt section built from past user corrections; empty when there are none or the table is not migrated yet. */
export async function loadScanLessonsPrompt(rawText: string): Promise<string> {
  try {
    const rows = await prisma.scanCorrection.findMany({
      orderBy: { createdAt: 'desc' },
      take: LESSON_POOL_SIZE,
      select: { field: true, aiValue: true, correctedValue: true, context: true },
    });
    return formatScanLessons(selectScanLessons(rows as Parameters<typeof selectScanLessons>[0], rawText));
  } catch (error) {
    console.warn('[scan-learning] Lessons unavailable:', error instanceof Error ? error.message.slice(0, 120) : 'unknown');
    return '';
  }
}

/** Stores the differences between the signed AI extraction and the event the user actually published. */
export async function recordScanCorrections(token: unknown, final: Partial<Record<LearnedScanField, unknown>>, userId?: number | null): Promise<number> {
  const baseline = verifyScanBaseline(token);
  if (!baseline) return 0;
  return storeScanCorrections(baseline, final, userId);
}

export async function recordSavedEventCorrections(evidence: unknown, previous: Partial<Record<LearnedScanField, unknown>>, final: Partial<Record<LearnedScanField, unknown>>, userId: number): Promise<number> {
  const baseline = verifyScanBaseline(evidence);
  if (!baseline) return 0;
  const matches = LEARNED_SCAN_FIELDS.every(field => {
    const value = typeof previous[field] === 'string' ? previous[field] : '';
    return baseline.fields[field] === value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  });
  if (!matches) return 0;
  return storeScanCorrections(baseline, final, userId);
}

async function storeScanCorrections(baseline: Parameters<typeof diffScanCorrections>[0], final: Partial<Record<LearnedScanField, unknown>>, userId?: number | null): Promise<number> {
  const corrections = diffScanCorrections(baseline, final);
  if (!corrections.length) return 0;
  try {
    await prisma.scanCorrection.createMany({ data: corrections.map(correction => ({ ...correction, userId: userId ?? null })) });
    return corrections.length;
  } catch (error) {
    console.warn('[scan-learning] Corrections not stored:', error instanceof Error ? error.message.slice(0, 120) : 'unknown');
    return 0;
  }
}

export async function loadLearnedCropProfile(width: number, height: number, userId?: number): Promise<LearnedCropProfile | null> {
  if (!Number.isSafeInteger(userId) || !userId) return null;
  try {
    const samples = await prisma.posterCropLearningPair.findMany({
      where: { userId, width, height, createdAt: { gte: new Date(Date.now() - CROP_SAMPLE_MAX_AGE_MS) } },
      orderBy: { createdAt: 'desc' },
      take: MAX_CROP_LEARNING_PAIRS,
      select: { width: true, height: true, x: true, y: true, w: true, h: true },
    });
    return learnedCropProfile(samples);
  } catch (error) {
    console.warn('[scan-learning] Crop samples unavailable:', error instanceof Error ? error.message.slice(0, 120) : 'unknown');
    return null;
  }
}

export async function loadCropLearningExamples(width: number, height: number, userId?: number): Promise<{ original: string; corrected: string }[]> {
  if (!Number.isSafeInteger(userId) || !userId) return [];
  try {
    const rows = await prisma.posterCropLearningPair.findMany({
      where: { userId, width, height, createdAt: { gte: new Date(Date.now() - CROP_SAMPLE_MAX_AGE_MS) } },
      orderBy: { createdAt: 'desc' },
      take: MAX_CROP_LEARNING_PAIRS,
      select: { originalPath: true, correctedPath: true },
    });
    return await Promise.all(rows.map(async row => {
      const [original, corrected] = await Promise.all([
        downloadPrivateCropLearningImage(row.originalPath),
        downloadPrivateCropLearningImage(row.correctedPath),
      ]);
      return {
        original: `data:image/jpeg;base64,${original.toString('base64')}`,
        corrected: `data:image/jpeg;base64,${corrected.toString('base64')}`,
      };
    }));
  } catch (error) {
    console.warn('[scan-learning] Crop examples unavailable:', error instanceof Error ? error.message.slice(0, 120) : 'unknown');
    return [];
  }
}

export async function recordCropLearningPair(original: Buffer, corrected: Buffer, input: unknown, userId: number): Promise<boolean> {
  const sample = parseCropSample(input);
  if (!sample || !Number.isSafeInteger(userId) || userId < 1) return false;
  let uploaded: Awaited<ReturnType<typeof uploadPrivateCropLearningPair>> | undefined;
  try {
    const optimized = await Promise.all([original, corrected].map(bytes =>
      sharp(bytes).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 72, mozjpeg: true }).toBuffer(),
    ));
    uploaded = await uploadPrivateCropLearningPair(userId, optimized[0], optimized[1], sample);
    await prisma.posterCropLearningPair.create({
      data: { userId, ...sample, originalPath: uploaded.originalPath, correctedPath: uploaded.correctedPath },
    });
    return true;
  } catch (error) {
    if (uploaded) {
      await deletePrivateCropLearningImages([uploaded.originalPath, uploaded.correctedPath]).catch(() => undefined);
    }
    console.warn('[scan-learning] Crop pair not stored:', error instanceof Error ? error.message.slice(0, 120) : 'unknown');
    return false;
  }
}

export async function deleteExpiredCropLearningSamples(now = new Date(), maxBatches = 10): Promise<{ pairs: number; coordinateSamples: number }> {
  const cutoff = new Date(now.getTime() - CROP_SAMPLE_MAX_AGE_MS);
  let pairs = 0;
  for (let batch = 0; batch < maxBatches; batch++) {
    const expired = await prisma.posterCropLearningPair.findMany({
      where: { createdAt: { lt: cutoff } },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: { id: true, originalPath: true, correctedPath: true },
    });
    if (!expired.length) break;
    await deletePrivateCropLearningImages(expired.flatMap(row => [row.originalPath, row.correctedPath]));
    const deleted = await prisma.posterCropLearningPair.deleteMany({ where: { id: { in: expired.map(row => row.id) } } });
    pairs += deleted.count;
    if (deleted.count === 0) break;
  }
  const coordinateSamples = await prisma.posterCropSample.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return { pairs, coordinateSamples: coordinateSamples.count };
}
