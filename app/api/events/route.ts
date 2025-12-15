import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { uploadImageToSupabase } from '../../lib/supabase';

export async function POST(request: NextRequest) {
  try {
    let eventData: any = null;
    let imageFile: File | null = null;
    let imageUrl: string | undefined = undefined;

    const contentType = request.headers.get('content-type') || '';
    console.log('[API /events POST] Request received, Content-Type:', contentType);
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
      return NextResponse.json({ error: 'Unsupported Content-Type' }, { status: 400 });
    }

    // Ensure all fields are present with proper defaults
    const eventDataToSave = {
      title: eventData.title || '',
      description: eventData.description || '',
      date: eventData.date || '',
      time: eventData.time || '',
      location: eventData.location || '',
      organizer: eventData.organizer || '',
      category: eventData.category || '',
      price: eventData.price || '',
      rawText: typeof eventData.rawText === 'string' ? eventData.rawText : '',
      imageUrl: imageUrl || null,
    };

    console.log('[API /events POST] Saving event with data:', JSON.stringify(eventDataToSave, null, 2));

    const event = await prisma.event.create({
      data: eventDataToSave,
    });

    console.log('[API /events POST] Event saved successfully, ID:', event.id);
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    console.error('[API /events POST] Error saving event:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ 
      error: 'Failed to save event', 
      details: errorMessage 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const category = searchParams.get('category');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

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

    const events = await prisma.event.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}