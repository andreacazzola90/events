import { NextRequest, NextResponse } from 'next/server';
import { MAX_EVENT_MEDIA_BYTES, MAX_EVENT_MEDIA_REQUEST_BYTES, validateEventMediaFile } from '../../../lib/event-media';
import sharp from 'sharp';
import { createVerifiedPosterCrop, type PosterCropFailure, type PosterCropResult } from '../../../lib/poster-crop';
import { loadLearnedCropProfile } from '../../../lib/scan-learning-store';
import { createEventImageAnalyzer } from '../../../lib/vision-ai';

export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    if (Number(request.headers.get('content-length')) > MAX_EVENT_MEDIA_REQUEST_BYTES) {
      return NextResponse.json({ error: 'Immagine troppo grande' }, { status: 413, headers });
    }
    const form = await request.formData();
    const file = form.get('image');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Immagine mancante' }, { status: 400, headers });
    if (file.size > MAX_EVENT_MEDIA_BYTES) return NextResponse.json({ error: 'Immagine troppo grande' }, { status: 413, headers });
    const media = validateEventMediaFile(file.name, file.type, new Uint8Array(await file.arrayBuffer()), file.size);
    if (!media.ok || media.kind !== 'image') {
      return NextResponse.json({ error: 'Immagine non valida' }, { status: 400, headers });
    }
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(35_000)]);
    let providerStatus = '';
    // No Retry-After wait: a busy provider falls through to the next one or to the local bar detection.
    const analyze = createEventImageAnalyzer(process.env.AI_VISION_CROP_PROVIDERS || 'groq,nvidia', {
      budgetMs: 30_000, signal, jsonMode: true, retryRateLimit: false,
      onProviderFailure: (provider, status) => { providerStatus = `${provider}:${status || 'network'}`; },
    });
    const learned = await Promise.resolve()
      .then(async () => sharp(Buffer.from(await file.arrayBuffer())).metadata())
      .then(meta => {
        const rotated = (meta.orientation || 1) >= 5;
        const width = (rotated ? meta.height : meta.width) || 0;
        const height = (rotated ? meta.width : meta.height) || 0;
        return width && height ? loadLearnedCropProfile(width, height) : null;
      })
      .catch(() => null);
    let reason: PosterCropFailure = 'service-unavailable';
    let result: PosterCropResult | undefined;
    const crop = await createVerifiedPosterCrop(file, analyze, { title: '', date: '' }, {
      learned,
      onFailure: failure => { reason = failure; },
      onSuccess: success => { result = success; },
    });
    if (!crop || signal.aborted) return new NextResponse(null, {
      status: 204, headers: { ...headers, 'X-Image-Crop-Reason': signal.aborted ? 'timeout' : reason,
        ...(providerStatus ? { 'X-Image-Crop-Service-Status': providerStatus } : {}) },
    });
    const box = result?.box;
    return new NextResponse(new Uint8Array(crop), { headers: { ...headers, 'Content-Type': 'image/jpeg',
      ...(box ? { 'X-Image-Crop-Box': [box.x, box.y, box.width, box.height].map(value => value.toFixed(5)).join(',') } : {}),
      ...(result ? { 'X-Image-Crop-Method': result.method } : {}),
    } });
  } catch {
    return new NextResponse(null, { status: 204, headers: { ...headers, 'X-Image-Crop-Reason': 'service-unavailable' } });
  }
}