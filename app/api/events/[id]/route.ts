import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getServerSession } from 'next-auth/next';
import { prisma } from '@/lib/prisma';
import { generateUniqueSlug } from '../../../../lib/slug-utils';
import { toIsoDate } from '../../../../lib/event-utils';
import { deleteEventMediaFromSupabase, getEventStoragePathFromPublicUrl, uploadEventMediaToSupabase, uploadOriginalEventImageToSupabase } from '../../../lib/supabase';
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

function revalidateModerationCaches(eventPath: string): boolean {
    try {
        revalidatePath('/', 'layout');
        revalidateTag('events-list', { expire: 0 });
        revalidatePath(eventPath, 'page');
        revalidatePath('/sitemap.xml');
        return true;
    } catch (error) {
        console.error('[API /events/[id]] Cache invalidation failed after moderation:', error);
        return false;
    }
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
        const eventId = /^\d+$/.test(id) ? Number(id) : Number.NaN;

        if (!Number.isSafeInteger(eventId) || eventId < 1) {
            return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
        }

        const session: any = await getServerSession(authOptions as any);
        const isAdmin = isAdminSession(session);
        const event = await prisma.event.findUnique({
            where: { id: eventId },
            include: { media: { orderBy: { position: 'asc' } } },
        });

        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }

        const userId = parseInt((session?.user as any)?.id as string, 10);
        const canViewDraft = isAdmin || (!Number.isNaN(userId) && event.createdById === userId);
        if (!event.isPublished && !canViewDraft) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }

        const canViewOriginal = canViewDraft;
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
        return NextResponse.json(event, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        console.error('Error fetching event:', error);
        return NextResponse.json({ error: 'Failed to fetch event' }, { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session: any = await getServerSession(authOptions as any);
    if (!session?.user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
    if (!isAdminSession(session)) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 });

    const { id } = await params;
    const eventId = /^\d+$/.test(id) ? Number(id) : Number.NaN;
    if (!Number.isSafeInteger(eventId) || eventId < 1) {
        return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'JSON non valido' }, { status: 400 });
    }
    if (!body || typeof body !== 'object' || !('isPublished' in body) || typeof body.isPublished !== 'boolean') {
        return NextResponse.json({ error: 'isPublished deve essere un booleano' }, { status: 400 });
    }

    try {
        const event = await prisma.event.update({
            where: { id: eventId },
            data: { isPublished: body.isPublished },
            select: { id: true, title: true, isPublished: true },
        });
        const slug = generateUniqueSlug(event.title, event.id);
        const cacheInvalidated = revalidateModerationCaches(`/events/${slug}`);
        return NextResponse.json({ ...event, cacheInvalidated }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
            return NextResponse.json({ error: 'Evento non trovato' }, { status: 404 });
        }
        console.error('[API /events/[id] PATCH] Error updating publication status:', error);
        return NextResponse.json({ error: 'Impossibile aggiornare lo stato di pubblicazione' }, { status: 500 });
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session: any = await getServerSession(authOptions as any);
    if (!session?.user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
    if (!isAdminSession(session)) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 });

    const { id } = await params;
    const eventId = /^\d+$/.test(id) ? Number(id) : Number.NaN;
    if (!Number.isSafeInteger(eventId) || eventId < 1) {
        return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
    }

    let deletion: {
        event: { id: number; title: string };
        storagePaths: string[];
    } | null;
    try {
        deletion = await prisma.$transaction(async transaction => {
            await transaction.$queryRaw`SELECT pg_advisory_xact_lock(${eventId})`;
            const lockedRows = await transaction.$queryRaw<{ id: number }[]>`SELECT "id" FROM "Event" WHERE "id" = ${eventId} FOR UPDATE`;
            if (!lockedRows.length) return null;

            const event = await transaction.event.findUnique({
                where: { id: eventId },
                select: {
                    id: true,
                    title: true,
                    imageUrl: true,
                    originalImageUrl: true,
                    media: { select: { storagePath: true, url: true } },
                },
            });
            if (!event) return null;

            const coverStoragePath = getEventStoragePathFromPublicUrl(event.imageUrl);
            const originalStoragePath = getEventStoragePathFromPublicUrl(event.originalImageUrl);
            const coverIsOwned = !!coverStoragePath && coverStoragePath.startsWith(`${event.id}/`);
            const legacyCoverIsManaged = !!coverStoragePath &&
                /^\d+-[a-z0-9]+\.[a-z0-9]+$/i.test(coverStoragePath);
            const originalIsOwned = !!originalStoragePath &&
                /^originals\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[a-z0-9._-]+$/i.test(originalStoragePath);
            const assets = [
                ...event.media.map(media => ({ storagePath: media.storagePath, url: media.url })),
                ...(coverIsOwned || legacyCoverIsManaged
                    ? [{ storagePath: coverStoragePath!, url: event.imageUrl! }]
                    : []),
                ...(originalIsOwned && event.originalImageUrl
                    ? [{ storagePath: originalStoragePath!, url: event.originalImageUrl }]
                    : []),
            ];
            const storagePaths = new Set<string>();
            for (const asset of assets) {
                const otherReference = await transaction.event.findFirst({
                    where: {
                        id: { not: eventId },
                        OR: [
                            { imageUrl: asset.url },
                            { originalImageUrl: asset.url },
                            { media: { some: { url: asset.url } } },
                        ],
                    },
                    select: { id: true },
                });
                if (!otherReference) storagePaths.add(asset.storagePath);
            }

            await transaction.favorite.deleteMany({ where: { eventId } });
            await transaction.event.delete({ where: { id: eventId } });
            return { event, storagePaths: [...storagePaths] };
        });
    } catch (error) {
        console.error('[API /events/[id] DELETE] Unable to load event:', error);
        return NextResponse.json({ error: 'Eliminazione non riuscita: impossibile confermare la modifica al database' }, { status: 500 });
    }
    if (!deletion) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

    const cleanupFailures: string[] = [];
    await Promise.all(deletion.storagePaths.map(async storagePath => {
        try {
            await deleteEventMediaFromSupabase(storagePath, { signal: AbortSignal.timeout(10_000) });
        } catch (error) {
            cleanupFailures.push(storagePath);
            console.error('[API /events/[id] DELETE] Storage cleanup failed:', storagePath, error);
        }
    }));

    const cacheInvalidated = revalidateModerationCaches(`/events/${generateUniqueSlug(deletion.event.title, deletion.event.id)}`);

    if (cleanupFailures.length || !cacheInvalidated) {
        return NextResponse.json({
            error: [
                cleanupFailures.length ? 'Evento eliminato dal database, ma la pulizia di alcuni file non è riuscita' : null,
                !cacheInvalidated ? 'Le cache pubbliche non sono state aggiornate' : null,
            ].filter(Boolean).join('. '),
            deleted: true,
            cleanupFailures,
            cacheInvalidated,
        }, { status: 500, headers: { 'Cache-Control': 'private, no-store' } });
    }
    return NextResponse.json({ ok: true, deleted: true, cacheInvalidated }, { headers: { 'Cache-Control': 'private, no-store' } });
}