import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    let eventData: any = null;
    let imageFile: File | null = null;
    let imageUrl: string | undefined = undefined;

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      // Handle JSON body
      eventData = await request.json();
      imageUrl = eventData.imageUrl;
    } else if (contentType.includes('multipart/form-data')) {
      // Handle multipart/form-data
      const formData = await request.formData();
      eventData = JSON.parse(formData.get('eventData') as string);
      imageFile = formData.get('image') as File | null;
      imageUrl = eventData.imageUrl;

      // Save image if provided
      if (imageFile) {
        const bytes = await imageFile.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Create unique filename
        const timestamp = Date.now();
        const filename = `${timestamp}-${imageFile.name}`;
        const filepath = join(process.cwd(), 'public', 'uploads', 'events', filename);

        // Ensure directory exists
        await mkdir(join(process.cwd(), 'public', 'uploads', 'events'), { recursive: true });

        // Write file
        await writeFile(filepath, buffer);

        // Set URL for database
        imageUrl = `/uploads/events/${filename}`;
      }
    } else {
      return NextResponse.json({ error: 'Unsupported Content-Type' }, { status: 400 });
    }

    // Ensure rawText is always present (required by schema)
    if (typeof eventData.rawText !== 'string') {
      eventData.rawText = '';
    }
    const event = await prisma.event.create({
      data: {
        title: eventData.title,
        description: eventData.description,
        date: eventData.date,
        time: eventData.time,
        location: eventData.location,
        organizer: eventData.organizer,
        category: eventData.category,
        price: eventData.price,
        rawText: eventData.rawText,
        imageUrl: imageUrl,
      },
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    console.error('Error saving event:', error);
    return NextResponse.json({ error: 'Failed to save event' }, { status: 500 });
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