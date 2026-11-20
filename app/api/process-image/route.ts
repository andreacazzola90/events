import { NextRequest, NextResponse } from 'next/server';
import { extensionCorsPreflight, withExtensionCors } from '../../../lib/extension-cors';
import { VisionServiceUnavailableError } from '../../../lib/vision-ai';
import { ImageScanError, scanPosterImage } from './scan';

export async function POST(request: NextRequest) {
  try {
    const file = (await request.formData()).get('image');
    if (!(file instanceof File)) {
      return withExtensionCors(NextResponse.json({ error: 'No image file provided' }, { status: 400 }), request);
    }
    return withExtensionCors(NextResponse.json(await scanPosterImage(file, request.signal)), request);
  } catch (error) {
    if (error instanceof VisionServiceUnavailableError) {
      return withExtensionCors(NextResponse.json({ error: error.message, code: 'VISION_SERVICE_UNAVAILABLE' }, { status: 503 }), request);
    }
    if (error instanceof ImageScanError) {
      return withExtensionCors(NextResponse.json({ error: error.message, code: error.code }, { status: error.status }), request);
    }
    console.error('[process-image] Scan unavailable:', error);
    return withExtensionCors(NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to process image',
    }, { status: 500 }), request);
  }
}

export async function OPTIONS(request: NextRequest) {
  return extensionCorsPreflight(request);
}
