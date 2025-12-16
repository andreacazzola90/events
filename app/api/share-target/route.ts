import { NextRequest, NextResponse } from 'next/server';

/**
 * Web Share Target API handler
 * Receives shared images from other apps and redirects to /crea
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const sharedImage = formData.get('image');
    
    console.log('[Share Target] Received shared content');
    
    if (sharedImage && sharedImage instanceof File) {
      console.log('[Share Target] Shared image:', sharedImage.name, sharedImage.type);
      
      // Store the image in cache for the /crea page to retrieve
      if (typeof caches !== 'undefined') {
        const cache = await caches.open('shared-images');
        const imageBlob = new Blob([await sharedImage.arrayBuffer()], { type: sharedImage.type });
        const response = new Response(imageBlob);
        await cache.put('/shared-image', response);
        console.log('[Share Target] Image cached successfully');
      }
    }
    
    // Redirect to /crea with shared flag
    return NextResponse.redirect(new URL('/crea?shared=true', request.url));
    
  } catch (error) {
    console.error('[Share Target] Error handling shared content:', error);
    // Still redirect to /crea even on error
    return NextResponse.redirect(new URL('/crea', request.url));
  }
}

// Handle GET requests (when user clicks the shortcut without sharing)
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/crea', request.url));
}
