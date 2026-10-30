import { prisma } from '../app/lib/prisma';
import { diffScanCorrections, formatScanLessons, selectScanLessons, verifyScanBaseline, type LearnedScanField } from './scan-learning';
import { learnedCropProfile, type CropSample, type LearnedCropProfile } from './poster-crop-learning';

const LESSON_POOL_SIZE = 300;
const CROP_SAMPLE_MAX_AGE_MS = 180 * 24 * 60 * 60_000;

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

export async function loadLearnedCropProfile(width: number, height: number): Promise<LearnedCropProfile | null> {
  try {
    const samples = await prisma.posterCropSample.findMany({
      where: { width, height, createdAt: { gte: new Date(Date.now() - CROP_SAMPLE_MAX_AGE_MS) } },
      orderBy: { createdAt: 'desc' },
      take: 7,
      select: { width: true, height: true, x: true, y: true, w: true, h: true },
    });
    return learnedCropProfile(samples);
  } catch (error) {
    console.warn('[scan-learning] Crop samples unavailable:', error instanceof Error ? error.message.slice(0, 120) : 'unknown');
    return null;
  }
}

export async function recordCropSample(sample: CropSample, userId?: number | null): Promise<boolean> {
  try {
    await prisma.posterCropSample.create({ data: { ...sample, userId: userId ?? null } });
    return true;
  } catch (error) {
    console.warn('[scan-learning] Crop sample not stored:', error instanceof Error ? error.message.slice(0, 120) : 'unknown');
    return false;
  }
}
