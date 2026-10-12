import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getServerSession } from 'next-auth/next';
import { prisma } from '@/lib/prisma';
import { generateUniqueSlug } from '../../../../lib/slug-utils';
import { toIsoDate } from '../../../../lib/event-utils';
import { deleteEventMediaFromSupabase, uploadEventMediaToSupabase } from '../../../lib/supabase';
import { validateEventMediaFile } from '../../../../lib/event-media';
import { authOptions } from '../../../../pages/api/auth/[...nextauth]';

function isAdminSession(session: any): boolean {
    const user = session?.user as any;
    const email = (user?.email || '').toLowerCase();
    return (
        user?.role === 'admin' ||
        user?.type === 'admin' ||
        email === 'andreacazzola90@gmail.com'
    );
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    let uploadedCoverPath: string | null = null;
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
            imageFile = (formData.get('coverImage') || formData.get('image')) as File | null;
            imageUrl = data.imageUrl;

            if (imageFile instanceof File && imageFile.size > 0) {
                const validation = validateEventMediaFile(imageFile.name, imageFile.type, new Uint8Array(await imageFile.arrayBuffer()), imageFile.size);
                if (!validation.ok || validation.kind !== 'image') {
                    return NextResponse.json({ error: validation.ok ? 'La copertina deve essere un’immagine' : validation.error }, { status: 400 });
                }
                const uploaded = await uploadEventMediaToSupabase(imageFile, eventId);
                uploadedCoverPath = uploaded.storagePath;
                imageUrl = uploaded.url;
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
                date: toIsoDate(data.date),
                time: data.time,
                location: data.location,
                organizer: data.organizer,
                category: data.category,
                price: data.price,
                rawText: data.rawText,
                imageUrl: imageUrl,
            },
        });
        uploadedCoverPath = null;

        revalidatePath('/', 'layout');
        revalidateTag('events-list', { expire: 0 });
        revalidatePath(`/events/${generateUniqueSlug(updated.title, updated.id)}`, 'page');

        return NextResponse.json(updated);
    } catch (error) {
        if (uploadedCoverPath) {
            await deleteEventMediaFromSupabase(uploadedCoverPath).catch(() => {
                console.error('[API /events/[id] PUT] Cleanup cover fallito');
            });
        }
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
            include: { media: { orderBy: { position: 'asc' } } },
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