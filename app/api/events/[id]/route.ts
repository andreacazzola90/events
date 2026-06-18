import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { prisma } from '@/lib/prisma';
import { authOptions } from '../../../../pages/api/auth/[...nextauth]';

function isAdminSession(session: any): boolean {
    const user = session?.user as any;
    const email = (user?.email || '').toLowerCase();
    return (
        user?.role === 'admin' ||
        user?.type === 'admin' ||
        email === 'andreacazzola90@gmail.com' ||
        email.startsWith('andreacazzola90@')
    );
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session: any = await getServerSession(authOptions as any);
        if (!session?.user) {
            return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
        }

        const userId = parseInt((session.user as any).id as string, 10);
        if (Number.isNaN(userId)) {
            return NextResponse.json({ error: 'Sessione non valida' }, { status: 401 });
        }

        const { id } = await params;
        const eventId = parseInt(id, 10);
        if (Number.isNaN(eventId)) {
            return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
        }

        const event = await prisma.event.findUnique({
            where: { id: eventId },
            select: { id: true, createdById: true },
        });

        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }

        const isAdmin = isAdminSession(session);
        const canEdit = isAdmin || event.createdById === userId;
        if (!canEdit) {
            return NextResponse.json(
                { error: 'Non puoi modificare questo evento' },
                { status: 403 }
            );
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

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const eventId = parseInt(id, 10);

        if (Number.isNaN(eventId)) {
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