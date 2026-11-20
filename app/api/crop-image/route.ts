import { NextRequest, NextResponse } from 'next/server';
import { MAX_EVENT_MEDIA_BYTES, MAX_EVENT_MEDIA_REQUEST_BYTES, validateEventMediaFile } from '../../../lib/event-media';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../pages/api/auth/[...nextauth]';
import { verifyPosterCover } from '../../../lib/verify-poster-cover';

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
    const session = await getServerSession(authOptions as never).catch(() => null) as { user?: { id?: string | number } } | null;
    const userId = Number.parseInt(String(session?.user?.id ?? ''), 10);
    const accountId = Number.isSafeInteger(userId) && userId > 0 ? userId : undefined;
    const { crop, reason, result, unchanged, providerStatus } = await verifyPosterCover(file, accountId, request.signal);
    if (unchanged || !crop) return new NextResponse(null, {
      status: 204, headers: { ...headers,
        ...(unchanged ? { 'X-Image-Crop-Status': 'unchanged' }
            : { 'X-Image-Crop-Reason': reason }),
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