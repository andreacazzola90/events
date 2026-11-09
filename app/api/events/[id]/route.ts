import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getServerSession } from 'next-auth/next';
import { prisma } from '@/lib/prisma';
import { generateUniqueSlug } from '../../../../lib/slug-utils';
import { toIsoDate } from '../../../../lib/event-utils';
import { deleteEventMediaFromSupabase, uploadEventMediaToSupabase, uploadOriginalEventImageToSupabase } from '../../../lib/supabase';
import { validateEventMediaFile, validateOriginalEventImageFile } from '../../../../lib/event-media';
import { isCoverImageCrop } from '../../../../lib/cover-image-crop';
import { authOptions } from '../../../../pages/api/auth/[...nextauth]';
import { recordSavedEventCorrections } from '../../../../lib/scan-learning-store';

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
    let uploadedOriginalPath: string | null = null;
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
            select: {
                id: true, createdById: true, title: true, date: true, time: true, location: true, imageUrl: true,
                organizer: true, category: true, price: true, rawText: true, originalImageUrl: true,
                originalImageCropX: true, originalImageCropY: true,
                originalImageCropWidth: true, originalImageCropHeight: true,
            },
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
        let originalImageFile: File | null = null;
        let imageUrl: string | undefined = undefined;

        if (contentType.includes('application/json')) {
            data = await request.json();
            imageUrl = data.imageUrl;
        } else if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            data = JSON.parse(formData.get('eventData') as string);
            if (data.originalImageCrop != null && !isCoverImageCrop(data.originalImageCrop)) {
                return NextResponse.json({ error: 'Coordinate di ritaglio non valide' }, { status: 400 });
            }
            imageFile = (formData.get('coverImage') || formData.get('image')) as File | null;
            const original = formData.get('originalImage');
            originalImageFile = original instanceof File && original.size > 0 ? original : null;
            imageUrl = data.imageUrl;

            if (imageFile instanceof File && imageFile.size > 0) {
                const validation = validateEventMediaFile(imageFile.name, imageFile.type, new Uint8Array(await imageFile.arrayBuffer()), imageFile.size);
                if (!validation.ok || validation.kind !== 'image') {
                    return NextResponse.json({ error: validation.ok ? 'La copertina deve essere un’immagine' : validation.error }, { status: 400 });
                }
            }
            if (originalImageFile) {
                const bytes = new Uint8Array(await originalImageFile.arrayBuffer());
                const validation = validateOriginalEventImageFile(
                    originalImageFile.name,
                    originalImageFile.type,
                    bytes,
                    originalImageFile.size,
                );
                if (!validation.ok || validation.kind !== 'image') {
                    return NextResponse.json({ error: validation.ok ? 'La sorgente deve essere un’immagine' : validation.error }, { status: 400 });
                }
            }
            if (imageFile instanceof File && imageFile.size > 0) {
                const uploaded = await uploadEventMediaToSupabase(imageFile, eventId);
                uploadedCoverPath = uploaded.storagePath;
                imageUrl = uploaded.url;
            }
            if (originalImageFile) {
                const uploaded = await uploadOriginalEventImageToSupabase(originalImageFile);
                uploadedOriginalPath = uploaded.storagePath;
                data.originalImageUrl = uploaded.url;
            }
        } else {
            return NextResponse.json({ error: 'Unsupported Content-Type' }, { status: 400 });
        }

        const cropProvided = Object.hasOwn(data, 'originalImageCrop');
        const crop = data.originalImageCrop;
        if (cropProvided && crop !== null && !isCoverImageCrop(crop)) {
            return NextResponse.json({ error: 'Coordinate di ritaglio non valide' }, { status: 400 });
        }
        const existingCrop = event.originalImageCropX !== null && event.originalImageCropY !== null
            && event.originalImageCropWidth !== null && event.originalImageCropHeight !== null
            ? {
                x: event.originalImageCropX,
                y: event.originalImageCropY,
                width: event.originalImageCropWidth,
                height: event.originalImageCropHeight,
            }
            : null;
        const imageCrop = cropProvided
            ? (isCoverImageCrop(crop) ? crop : null)
            : imageFile || originalImageFile ? null : existingCrop;
        const originalImageUrl = originalImageFile
            ? data.originalImageUrl
            : imageFile && !event.originalImageUrl
                ? (isCoverImageCrop(crop) && event.imageUrl ? event.imageUrl : imageUrl)
                : event.originalImageUrl;

        if (typeof data.rawText !== 'string') {
            data.rawText = event.rawText;
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
                originalImageUrl,
                originalImageCropX: imageCrop?.x ?? null,
                originalImageCropY: imageCrop?.y ?? null,
                originalImageCropWidth: imageCrop?.width ?? null,
                originalImageCropHeight: imageCrop?.height ?? null,
            },
        });
        uploadedCoverPath = null;
        uploadedOriginalPath = null;

        try {
            await recordSavedEventCorrections(data.scanFeedbackToken, event, updated, userId);
        } catch {
            console.warn('[API /events/[id] PUT] Event saved; corrections unavailable');
        }

        revalidatePath('/', 'layout');
        revalidateTag('events-list', { expire: 0 });
        revalidatePath(`/events/${generateUniqueSlug(updated.title, updated.id)}`, 'page');

        return NextResponse.json(updated);
    } catch (error) {
        const paths = [uploadedCoverPath, uploadedOriginalPath].filter((path): path is string => !!path);
        await Promise.all(paths.map(path => deleteEventMediaFromSupabase(path).catch(cleanupError => {
            console.error('[API /events/[id] PUT] Cleanup immagine fallito:', cleanupError);
        })));
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

        const session: any = await getServerSession(authOptions as any);
        const userId = parseInt((session?.user as any)?.id as string, 10);
        const canViewOriginal = isAdminSession(session) || (!Number.isNaN(userId) && event.createdById === userId);
        if (!canViewOriginal) {
            return NextResponse.json({
                ...event,
                originalImageUrl: null,
                originalImageCropX: null,
                originalImageCropY: null,
                originalImageCropWidth: null,
                originalImageCropHeight: null,
            });
        }
        return NextResponse.json(event);
    } catch (error) {
        console.error('Error fetching event:', error);
        return NextResponse.json({ error: 'Failed to fetch event' }, { status: 500 });
    }
}