import { NextRequest, NextResponse } from 'next/server';
import { MAX_EVENT_MEDIA_BYTES, MAX_EVENT_MEDIA_REQUEST_BYTES, validateEventMediaFile } from '../../../lib/event-media';
import { createVerifiedPosterCrop, type PosterCropFailure } from '../../../lib/poster-crop';
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
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(50_000)]);
    let providerStatus = '';
    const analyze = createEventImageAnalyzer(process.env.AI_VISION_CROP_PROVIDERS || 'groq', {
      budgetMs: 45_000, signal, jsonMode: true, retryRateLimit: true,
      onProviderFailure: (provider, status) => { providerStatus = `${provider}:${status || 'network'}`; },
    });
    let reason: PosterCropFailure = 'service-unavailable';
    const crop = await createVerifiedPosterCrop(file, analyze, { title: '', date: '' }, {
      onFailure: failure => { reason = failure; },
    });
    if (!crop || signal.aborted) return new NextResponse(null, {
      status: 204, headers: { ...headers, 'X-Image-Crop-Reason': signal.aborted ? 'timeout' : reason,
        ...(providerStatus ? { 'X-Image-Crop-Service-Status': providerStatus } : {}) },
    });
    return new NextResponse(new Uint8Array(crop), { headers: { ...headers, 'Content-Type': 'image/jpeg' } });
  } catch {
    return new NextResponse(null, { status: 204, headers: { ...headers, 'X-Image-Crop-Reason': 'service-unavailable' } });
  }
}