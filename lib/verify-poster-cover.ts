import sharp from 'sharp';
import { createVerifiedPosterCrop, type PosterCropFailure, type PosterCropResult } from './poster-crop';
import { loadCropLearningExamples, loadLearnedCropProfile } from './scan-learning-store';
import { createEventImageAnalyzer } from './vision-ai';

export async function verifyPosterCover(file: File, ownerId: number | undefined, parentSignal: AbortSignal) {
  const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(35_000)]);
  const learned = ownerId ? await (async () => {
    const meta = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
    const rotated = (meta.orientation || 1) >= 5;
    const width = rotated ? meta.height : meta.width;
    const height = rotated ? meta.width : meta.height;
    if (!width || !height) return null;
    const [profile, examples] = await Promise.all([
      loadLearnedCropProfile(width, height, ownerId),
      loadCropLearningExamples(width, height, ownerId),
    ]);
    return { profile, examples };
  })().catch(() => null) : null;
  let providerStatus = '';
  let unchanged = false;
  let reason: PosterCropFailure = 'service-unavailable';
  let result: PosterCropResult | undefined;
  const analyze = createEventImageAnalyzer(process.env.AI_VISION_CROP_PROVIDERS || 'groq,nvidia', {
    budgetMs: 30_000, signal, jsonMode: true, retryRateLimit: false,
    onProviderFailure: (provider, status) => { providerStatus = `${provider}:${status || 'network'}`; },
  });
  const crop = await createVerifiedPosterCrop(file, analyze, { title: '', date: '' }, {
    learned: learned?.profile,
    learningExamples: learned?.examples,
    onFailure: failure => { reason = failure; },
    onSuccess: success => { result = success; },
    onUnchanged: () => { unchanged = true; },
  });
  return signal.aborted
    ? { reason: 'timeout' as const, providerStatus, crop: undefined, unchanged: false, result: undefined }
    : { crop, reason, result, unchanged, providerStatus };
}
