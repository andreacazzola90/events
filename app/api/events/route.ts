import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { uploadImageToSupabase } from '../../lib/supabase';
import { geocodeLocation } from '@/lib/geocoding';
import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../pages/api/auth/[...nextauth]';
import { generateUniqueSlug } from '../../../lib/slug-utils';
import { authenticateExtensionRequest } from '../../../lib/extension-auth';
import { extensionCorsPreflight, withExtensionCors } from '../../../lib/extension-cors';

export async function OPTIONS(request: NextRequest) {
  return extensionCorsPreflight(request);
}

export async function POST(request: NextRequest) {
  try {
    let eventData: any = null;
    let imageFile: File | null = null;
    let imageUrl: string | undefined = undefined;

    const contentType = request.headers.get('content-type') || '';
    console.log('[API /events POST] Request received, Content-Type:', contentType);
    console.log('[API /events POST] Prisma Client version check: category is now a String');
    if (contentType.includes('application/json')) {
      // Handle JSON body
      eventData = await request.json();
      console.log('[API /events POST] JSON body received:', JSON.stringify(eventData, null, 2));
      imageUrl = eventData.imageUrl;
      
      // Se c'è un URL di immagine esterno, scaricalo e caricalo su Supabase
      if (imageUrl && !imageUrl.includes('supabase.co')) {
        try {
          console.log('[API /events POST] Downloading external image:', imageUrl);
          const imageResponse = await fetch(imageUrl);
          const imageBlob = await imageResponse.blob();
          const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());
          
          console.log('[API /events POST] Uploading external image to Supabase...');
          imageUrl = await uploadImageToSupabase(imageBuffer, 'events');
          console.log('[API /events POST] External image uploaded to Supabase:', imageUrl);
        } catch (uploadError) {
          console.warn('[API /events POST] Failed to upload external image, keeping original URL:', uploadError);
          // Mantieni l'URL originale se il caricamento fallisce
        }
      }
    } else if (contentType.includes('multipart/form-data')) {
      // Handle multipart/form-data
      const formData = await request.formData();
      eventData = JSON.parse(formData.get('eventData') as string);
      imageFile = formData.get('image') as File | null;
      imageUrl = eventData.imageUrl;

      // Upload image to Supabase if provided
      if (imageFile) {
        console.log('[API /events POST] Uploading image to Supabase...');
        imageUrl = await uploadImageToSupabase(imageFile, 'events');
        console.log('[API /events POST] Image uploaded to Supabase:', imageUrl);
      }
    } else {
      return withExtensionCors(
        NextResponse.json({ error: 'Unsupported Content-Type' }, { status: 400 }),
        request
      );
    }

    // Recupera la sessione per collegare l'evento all'utente loggato (se presente)
    const session: any = await getServerSession(authOptions as any);

    // Ensure all fields are present with proper defaults
    const eventDataToSave: any = {
      title: eventData.title || '',
      description: eventData.description || '',
      date: eventData.date || '',
      time: eventData.time || '',
      location: eventData.location || '',
      organizer: eventData.organizer || '',
      category: (eventData.category || 'other').toLowerCase().trim(),
      price: eventData.price || '',
      rawText: typeof eventData.rawText === 'string' ? eventData.rawText : '',
      imageUrl: imageUrl || null,
      sourceUrl: eventData.sourceUrl || null,
      origin: 'user',
    };

    // Collega l'evento all'utente autenticato, se disponibile
    if (session?.user?.id) {
      const userId = parseInt((session.user as any).id as string, 10);
      if (!Number.isNaN(userId)) {
        eventDataToSave.createdById = userId;
      }
    } else {
      const extensionUser = await authenticateExtensionRequest(request);
      if (extensionUser?.userId) {
        eventDataToSave.createdById = extensionUser.userId;
      }
    }

    // Check for duplicate events (same title, date and location)
    if (eventDataToSave.title && eventDataToSave.date && eventDataToSave.location) {
      const existing = await prisma.event.findFirst({
        where: {
          title: eventDataToSave.title,
          date: eventDataToSave.date,
          location: eventDataToSave.location,
        },
      });

      if (existing) {
        console.log('[API /events POST] Duplicate event detected, skipping create. Existing ID:', existing.id);
        return withExtensionCors(
          NextResponse.json(
            {
              error: 'EVENT_DUPLICATE',
              message: 'Questo evento è già stato creato (stesso titolo, data e luogo).',
              existingEventId: existing.id,
            },
            { status: 409 }
          ),
          request
        );
      }
    }

    // Geocode location once at creation time to store coordinates
    if (eventDataToSave.location) {
      try {
        const coords = await geocodeLocation(eventDataToSave.location);
        eventDataToSave.latitude = coords.latitude;
        eventDataToSave.longitude = coords.longitude;
        console.log('[API /events POST] Geocoded location to coordinates:', coords);
      } catch (geoError) {
        console.warn('[API /events POST] Failed to geocode location, continuing without coordinates:', geoError);
      }
    }

    console.log('[API /events POST] Saving event with data:', JSON.stringify(eventDataToSave, null, 2));

    const event = await prisma.event.create({
      data: eventDataToSave,
    });

    console.log('[API /events POST] Event saved successfully, ID:', event.id);
    
    // Revalidate all pages that display events
    revalidatePath('/', 'page');
    revalidatePath('/eventi', 'page');
    revalidatePath('/mappa', 'page');
    revalidateTag('events-list', 'max');
    const eventSlug = generateUniqueSlug(event.title, event.id);
    const eventDetailPath = `/events/${eventSlug}`;
    revalidatePath(eventDetailPath, 'page');
    console.log('[API /events POST] Cache revalidated for home, eventi, mappa pages and events-list tag');

    try {
      const listingUrl = new URL(`/api/events?limit=200&_rebuild=${Date.now()}`, request.nextUrl.origin).toString();
      await fetch(listingUrl, { cache: 'no-store' });
      console.log('[API /events POST] Events listing JSON rebuilt:', listingUrl);
    } catch (listingRebuildError) {
      console.warn('[API /events POST] Events listing JSON rebuild failed, continuing:', listingRebuildError);
    }

    try {
      const detailUrl = new URL(eventDetailPath, request.nextUrl.origin).toString();
      await fetch(detailUrl, { cache: 'no-store' });
      console.log('[API /events POST] Event detail pre-warmed:', detailUrl);
    } catch (prewarmError) {
      console.warn('[API /events POST] Event detail pre-warm failed, continuing:', prewarmError);
    }
    
    return withExtensionCors(
      NextResponse.json({ ...event, slug: eventSlug }, {
        status: 201,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        }
      }),
      request
    );
  } catch (error) {
    console.error('[API /events POST] Error saving event:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return withExtensionCors(
      NextResponse.json({
        error: 'Failed to save event',
        details: errorMessage
      }, { status: 500 }),
      request
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const category = searchParams.get('category');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20;
    const userIdParam = searchParams.get('userId');

    const where: any = {};

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    if (category) {
      where.category = category;
    }

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = dateFrom;
      if (dateTo) where.date.lte = dateTo;
    }

    if (userIdParam) {
      const parsed = parseInt(userIdParam, 10);
      if (!Number.isNaN(parsed)) {
        where.createdById = parsed;
      }
    }

    // Use unstable_cache to cache the database query
    const getCachedEvents = unstable_cache(
      async (queryWhere, queryLimit) => {
        return prisma.event.findMany({
          where: queryWhere,
          orderBy: { createdAt: 'desc' },
          take: queryLimit,
        });
      },
      ['events-list-query'], // Key parts (will be combined with args automatically in newer Next.js, but explicit keys are safer)
      { 
        tags: ['events-list'],
        revalidate: 60 // Revalidate every 60 seconds as fallback
      }
    );

    // We need to pass the arguments to the cached function. 
    // Note: unstable_cache memoizes based on the arguments passed to the returned function.
    // However, the second argument to unstable_cache (keyParts) is static. 
    // To make it dynamic based on args, we rely on the args being part of the cache key internally.
    // But to be safe and explicit with tags, we use the tag 'events-list'.
    
    const events = await getCachedEvents(where, limit);

    // Backfill coordinates for events that still don't have them
    try {
      const eventsNeedingCoords = events.filter((event: any) =>
        event.location && (event.latitude == null || event.longitude == null)
      );

      if (eventsNeedingCoords.length > 0) {
        console.log('[API /events GET] Backfilling coordinates for events:', eventsNeedingCoords.map((e: any) => ({ id: e.id, title: e.title, location: e.location })));

        await Promise.allSettled(
          eventsNeedingCoords.map(async (event: any) => {
            try {
              const coords = await geocodeLocation(event.location);
              if (coords.latitude != null && coords.longitude != null) {
                // Update in memory so this response already includes coordinates
                event.latitude = coords.latitude;
                event.longitude = coords.longitude;

                // Persist to database for future requests
                await prisma.event.update({
                  where: { id: event.id },
                  data: {
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                  } as any,
                });
              }
            } catch (geoError) {
              console.warn('[API /events GET] Failed to backfill coordinates for event', event.id, geoError);
            }
          })
        );
      }
    } catch (backfillError) {
      console.warn('[API /events GET] Coordinate backfill failed, continuing without it:', backfillError);
    }

    // If this is a global listing (no specific userId), de-duplicate
    // events by (title, date, location), keeping only the first
    let responseEvents: any[] = events;
    if (!userIdParam) {
      const seenKeys = new Set<string>();
      responseEvents = events.filter((event: any) => {
        const key = `${(event.title || '').trim()}|||${(event.date || '').trim()}|||${(event.location || '').trim()}`;
        if (!key.trim()) return true; // if key is empty, don't dedupe aggressively
        if (seenKeys.has(key)) {
          return false;
        }
        seenKeys.add(key);
        return true;
      });
    }

    return NextResponse.json(responseEvents, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30', // Cache for 60s, allow stale for 30s
      },
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}