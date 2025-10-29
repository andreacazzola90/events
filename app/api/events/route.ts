import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const eventData = JSON.parse(formData.get('eventData') as string);
    const imageFile = formData.get('image') as File | null;

    let imageUrl = eventData.imageUrl;

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