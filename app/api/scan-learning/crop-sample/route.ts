import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../pages/api/auth/[...nextauth]';
import { MAX_EVENT_MEDIA_BYTES, validateEventMediaFile } from '../../../../lib/event-media';
import { parseCropSample } from '../../../../lib/poster-crop-learning';
import { recordCropLearningPair } from '../../../../lib/scan-learning-store';
import { readBoundedRequestBody, requestWithBoundedBody, RequestBodyTooLargeError } from '../../../../lib/request-body-limit';

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const MAX_PAIR_REQUEST_BYTES = 14 * 1024 * 1024;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  for (const [client, entry] of requestCounts) if (entry.resetAt <= now) requestCounts.delete(client);
  const entry = requestCounts.get(key);
  if (!entry) {
    requestCounts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

function orientedSize(width: number, height: number, orientation = 1) {
  return orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height };
}

export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' };
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return new NextResponse(null, { status: 403, headers });
  if (Number(request.headers.get('content-length')) > MAX_PAIR_REQUEST_BYTES) {
    return NextResponse.json({ error: 'Le immagini superano il limite consentito.' }, { status: 413, headers });
  }

  const session = await getServerSession(authOptions as never).catch(() => null) as { user?: { id?: string | number } } | null;
  const userId = Number.parseInt(String(session?.user?.id ?? ''), 10);
  if (!Number.isSafeInteger(userId) || userId < 1) return new NextResponse(null, { status: 401, headers });

  const client = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(`${userId}:${client}`)) return new NextResponse(null, { status: 429, headers });

  let form: FormData | null = null;
  try {
    const body = await readBoundedRequestBody(request, MAX_PAIR_REQUEST_BYTES);
    form = await requestWithBoundedBody(request, body).formData();
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: 'Le immagini superano il limite consentito.' }, { status: 413, headers });
    }
  }
  if (!form || form.get('consent') !== 'true') return new NextResponse(null, { status: 204, headers });
  const original = form.get('original');
  const corrected = form.get('corrected');
  let sample: ReturnType<typeof parseCropSample> = null;
  try {
    sample = parseCropSample(form.get('sample') ? JSON.parse(String(form.get('sample'))) : null);
  } catch {
    return NextResponse.json({ error: 'Esempio di ritaglio non valido.' }, { status: 400, headers });
  }
  if (!(original instanceof File) || !(corrected instanceof File) || !sample ||
      original.size > 10 * 1024 * 1024 || corrected.size > MAX_EVENT_MEDIA_BYTES) {
    return NextResponse.json({ error: 'Esempio di ritaglio non valido.' }, { status: 400, headers });
  }

  const originalBytes = new Uint8Array(await original.arrayBuffer());
  const correctedBytes = new Uint8Array(await corrected.arrayBuffer());
  const originalMedia = validateEventMediaFile(original.name, original.type, originalBytes, original.size);
  const correctedMedia = validateEventMediaFile(corrected.name, corrected.type, correctedBytes, corrected.size);
  if (!originalMedia.ok || originalMedia.kind !== 'image' || !correctedMedia.ok || correctedMedia.kind !== 'image') {
    return NextResponse.json({ error: 'Immagini di ritaglio non valide.' }, { status: 400, headers });
  }

  try {
    const metadata = await sharp(Buffer.from(originalBytes)).metadata();
    const size = orientedSize(metadata.width || 0, metadata.height || 0, metadata.orientation);
    if (Math.abs(size.width - sample.width) > 1 || Math.abs(size.height - sample.height) > 1) {
      return NextResponse.json({ error: 'Le dimensioni del ritaglio non corrispondono alla fonte.' }, { status: 400, headers });
    }
    const saved = await recordCropLearningPair(Buffer.from(originalBytes), Buffer.from(correctedBytes), sample, userId);
    if (!saved) return NextResponse.json({ error: 'Non è stato possibile conservare l’esempio in modo privato.' }, { status: 503, headers });
    return new NextResponse(null, { status: 204, headers });
  } catch {
    return NextResponse.json({ error: 'Non è stato possibile validare o conservare l’esempio.' }, { status: 503, headers });
  }
}
