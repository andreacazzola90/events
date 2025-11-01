import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const eventId = parseInt(id);
        if (isNaN(eventId)) {
            return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
        }
        const contentType = request.headers.get('content-type') || '';
        let data: any = null;
        let imageFile: File | null = null;
        let imageUrl: string | undefined = undefined;
        if (contentType.includes('application/json')) {
            data = await request.json();
            imageUrl = data.imageUrl;
        } else if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            data = JSON.parse(formData.get('eventData') as string);
            imageFile = formData.get('image') as File | null;
            imageUrl = data.imageUrl;
            if (imageFile) {
                const bytes = await imageFile.arrayBuffer();
                const buffer = Buffer.from(bytes);
                const timestamp = Date.now();
                const filename = `${timestamp}-${imageFile.name}`;
                const filepath = join(process.cwd(), 'public', 'uploads', 'events', filename);
                await mkdir(join(process.cwd(), 'public', 'uploads', 'events'), { recursive: true });
                await writeFile(filepath, buffer);
                imageUrl = `/uploads/events/${filename}`;
            }
        } else {
            return NextResponse.json({ error: 'Unsupported Content-Type' }, { status: 400 });
        }
        if (typeof data.rawText !== 'string') {
            data.rawText = '';
        }
        if (typeof data.date !== 'string') {
            data.date = '';
        }
        const updated = await prisma.event.update({
            where: { id: eventId },
            data: {
                title: data.title,
                description: data.description,
                date: data.date,
                time: data.time,
                location: data.location,
                organizer: data.organizer,
                category: data.category,
                price: data.price,
                rawText: data.rawText,
                imageUrl: imageUrl,
            },
        });
        return NextResponse.json(updated);
    } catch (error) {
        console.error('Error updating event:', error);
        return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
    }
}
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const eventId = parseInt(id);

        if (isNaN(eventId)) {
            return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
        }

        const event = await prisma.event.findUnique({
            where: { id: eventId },
        });

        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }

        return NextResponse.json(event);
    } catch (error) {
        console.error('Error fetching event:', error);
        return NextResponse.json({ error: 'Failed to fetch event' }, { status: 500 });
    }
}