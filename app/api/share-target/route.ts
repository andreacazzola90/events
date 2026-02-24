import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

type SharedImageEntry = {
  bytes: ArrayBuffer;
  type: string;
  fileName: string;
  createdAt: number;
};

const SHARED_IMAGE_TTL_MS = 1000 * 60 * 10;

const sharedImagesStore: Map<string, SharedImageEntry> =
  (globalThis as any).__sharedImagesStore || new Map<string, SharedImageEntry>();

(globalThis as any).__sharedImagesStore = sharedImagesStore;

function cleanupExpiredSharedImages() {
  const now = Date.now();
  for (const [key, value] of sharedImagesStore.entries()) {
    if (now - value.createdAt > SHARED_IMAGE_TTL_MS) {
      sharedImagesStore.delete(key);
    }
  }
}

/**
 * Web Share Target API handler
 * Receives shared images from other apps and redirects to /crea
 */
export async function POST(request: NextRequest) {
  try {
    cleanupExpiredSharedImages();

    const formData = await request.formData();
    const sharedImage = formData.get('image');
    
    console.log('[Share Target] Received shared content');
    
    if (sharedImage && sharedImage instanceof File) {
      console.log('[Share Target] Shared image:', sharedImage.name, sharedImage.type);

      const shareId = crypto.randomUUID();
      const bytes = await sharedImage.arrayBuffer();

      sharedImagesStore.set(shareId, {
        bytes,
        type: sharedImage.type || 'image/jpeg',
        fileName: sharedImage.name || 'shared-image.jpg',
        createdAt: Date.now(),
      });

      console.log('[Share Target] Image stored successfully with shareId:', shareId);

      return NextResponse.redirect(new URL(`/crea?shared=true&shareId=${encodeURIComponent(shareId)}`, request.url), 303);
    }
    
    // Redirect to /crea if no valid image found
    return NextResponse.redirect(new URL('/crea?shared=true', request.url), 303);
    
  } catch (error) {
    console.error('[Share Target] Error handling shared content:', error);
    // Still redirect to /crea even on error
    return NextResponse.redirect(new URL('/crea', request.url), 303);
  }
}

// Handle GET requests: return shared file by ID, or redirect to /crea
export async function GET(request: NextRequest) {
  cleanupExpiredSharedImages();

  const shareId = request.nextUrl.searchParams.get('shareId');
  if (!shareId) {
    return NextResponse.redirect(new URL('/crea', request.url), 303);
  }

  const sharedEntry = sharedImagesStore.get(shareId);
  if (!sharedEntry) {
    return NextResponse.json({ error: 'Shared image not found or expired' }, { status: 404 });
  }

  sharedImagesStore.delete(shareId);

  const imageBlob = new Blob([sharedEntry.bytes], { type: sharedEntry.type });

  return new NextResponse(imageBlob, {
    status: 200,
    headers: {
      'Content-Type': sharedEntry.type,
      'Content-Disposition': `inline; filename="${sharedEntry.fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
