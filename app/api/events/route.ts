import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scheduleCalendarDeliveries } from "../../lib/google-calendar";
import { deleteEventMediaFromSupabase, uploadEventMediaToSupabase, uploadImageToSupabase, uploadOriginalEventImageToSupabase } from "../../lib/supabase";
import { geocodeLocation } from "@/lib/geocoding";
import { unstable_cache } from "next/cache";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../pages/api/auth/[...nextauth]";
import { generateUniqueSlug } from "../../../lib/slug-utils";
import { findDuplicateEvent, lockEventDates } from "../../../lib/event-duplicates";
import { toIsoDate } from "../../../lib/event-utils";
import { authenticateExtensionRequest } from "../../../lib/extension-auth";
import {
  extensionCorsPreflight,
  withExtensionCors,
} from "../../../lib/extension-cors";
import { recordScanCorrections } from "../../../lib/scan-learning-store";
import { createEventWithSeries } from "../../../lib/event-series-create";
import { MAX_ORIGINAL_EVENT_IMAGE_BYTES, redactOriginalEventImageMetadata, validateEventMediaFile, validateOriginalEventImageFile } from "../../../lib/event-media";
import { isCoverImageCrop } from "../../../lib/cover-image-crop";
import { invalidatePublicEvents, PUBLIC_EVENTS_TAG } from "../../../lib/public-event-cache";
import { calendarToday } from "../../../lib/calendar-view";
import type { Prisma } from "@prisma/client";
import { parseEventSeoFields, type EventSeoFieldValues } from "../../../lib/event-seo-fields";
import { posterFingerprint, savePosterFingerprint } from "../../../lib/poster-fingerprint";

function isAdminSession(session: any): boolean {
  const user = session?.user as any;
  const email = (user?.email || "").toLowerCase();
  return user?.role === "admin" || user?.type === "admin" || email === "andreacazzola90@gmail.com";
}

/** Stores the full poster as the event's first gallery image; failures never undo the event. */
async function attachPosterImage(eventId: number, poster: File) {
  let storagePath: string | undefined;
  let commitAttempted = false;
  const deadline = AbortSignal.timeout(10_000);
  const uploadSignal = AbortSignal.any([deadline, AbortSignal.timeout(8_000)]);
  try {
    const validation = validateEventMediaFile(poster.name, poster.type, new Uint8Array(await poster.arrayBuffer()), poster.size);
    if (!validation.ok || validation.kind !== "image") {
      console.warn("[API /events POST] Poster image rejected:", validation.ok ? "not an image" : validation.error);
      return;
    }
    const uploaded = await uploadEventMediaToSupabase(poster, eventId, { signal: uploadSignal });
    storagePath = uploaded.storagePath;
    deadline.throwIfAborted();
    commitAttempted = true;
    await prisma.eventMedia.create({
      data: {
        eventId, kind: "image", fileName: "Locandina completa", mimeType: poster.type,
        sizeBytes: poster.size, storagePath: uploaded.storagePath, url: uploaded.url, position: 0,
      },
    });
  } catch (error) {
    console.warn("[API /events POST] Poster image not saved:", error instanceof Error ? error.message : error);
    const definiteRejection = error && typeof error === 'object' && 'code' in error
      && (error.code === 'P2002' || error.code === 'P2003');
    if (storagePath && (!commitAttempted || definiteRejection) && !deadline.aborted) {
      await deleteEventMediaFromSupabase(storagePath, {
        signal: AbortSignal.any([deadline, AbortSignal.timeout(2_000)]),
      }).catch(() => undefined);
    }
  }
}

const getEvents = (where: Prisma.EventWhereInput, take: number) =>
  prisma.event.findMany({ where, orderBy: { createdAt: "desc" }, take });

const getCachedEvents = unstable_cache(
  async (where: Prisma.EventWhereInput, take: number) =>
    (await getEvents({ ...where, isPublished: true }, take)).map(redactOriginalEventImageMetadata),
  ["events-list-public-v2"],
  { tags: [PUBLIC_EVENTS_TAG], revalidate: 60 },
);

export async function OPTIONS(request: NextRequest) {
  return extensionCorsPreflight(request);
}

export async function POST(request: NextRequest) {
  let uploadedOriginalPath: string | null = null;
  try {
    let eventData: any = null;
    let imageFile: File | null = null;
    let originalImageFile: File | null = null;
    let posterFile: File | null = null;
    let fingerprint: string | null = null;
    let imageUrl: string | undefined = undefined;
    let originalImageUrl: string | undefined = undefined;
    let originalImageCrop: { x: number; y: number; width: number; height: number } | null = null;
    let seoFields: EventSeoFieldValues = {};

    const contentType = request.headers.get("content-type") || "";
    console.log(
      "[API /events POST] Request received, Content-Type:",
      contentType,
    );
    console.log(
      "[API /events POST] Prisma Client version check: category is now a String",
    );
    if (contentType.includes("application/json")) {
      // Handle JSON body
      eventData = await request.json();
      const seoValidation = parseEventSeoFields(eventData);
      if (!seoValidation.ok) {
        return withExtensionCors(NextResponse.json({ error: seoValidation.error }, { status: 400 }), request);
      }
      seoFields = seoValidation.fields;
      if (eventData.originalImageCrop != null && !isCoverImageCrop(eventData.originalImageCrop)) {
        return withExtensionCors(NextResponse.json({ error: "Coordinate di ritaglio non valide" }, { status: 400 }), request);
      }
      originalImageCrop = isCoverImageCrop(eventData.originalImageCrop) ? eventData.originalImageCrop : null;
      console.log(
        "[API /events POST] JSON body received:",
        JSON.stringify(eventData, null, 2),
      );
      imageUrl = eventData.imageUrl;
      originalImageUrl = imageUrl;

      // Se c'è un URL di immagine esterno, scaricalo e caricalo su Supabase
      if (imageUrl && !imageUrl.includes("supabase.co")) {
        try {
          console.log(
            "[API /events POST] Downloading external image:",
            imageUrl,
          );
          const imageResponse = await fetch(imageUrl);
          const imageBlob = await imageResponse.blob();
          const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());
          const mime = imageBlob.type.toLowerCase();
          const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[mime];
          if (imageResponse.ok && extension && validateOriginalEventImageFile(`poster.${extension}`, mime, imageBuffer).ok) {
            fingerprint = posterFingerprint(imageBuffer);
          }

          console.log(
            "[API /events POST] Uploading external image to Supabase...",
          );
          imageUrl = await uploadImageToSupabase(imageBuffer, "events");
          originalImageUrl = imageUrl;
          console.log(
            "[API /events POST] External image uploaded to Supabase:",
            imageUrl,
          );
        } catch (uploadError) {
          console.warn(
            "[API /events POST] Failed to upload external image, keeping original URL:",
            uploadError,
          );
          // Mantieni l'URL originale se il caricamento fallisce
        }
      }
    } else if (contentType.includes("multipart/form-data")) {
      // Handle multipart/form-data
      const formData = await request.formData();
      eventData = JSON.parse(formData.get("eventData") as string);
      const seoValidation = parseEventSeoFields(eventData);
      if (!seoValidation.ok) {
        return withExtensionCors(NextResponse.json({ error: seoValidation.error }, { status: 400 }), request);
      }
      seoFields = seoValidation.fields;
      if (eventData.originalImageCrop != null && !isCoverImageCrop(eventData.originalImageCrop)) {
        return withExtensionCors(NextResponse.json({ error: "Coordinate di ritaglio non valide" }, { status: 400 }), request);
      }
      originalImageCrop = isCoverImageCrop(eventData.originalImageCrop) ? eventData.originalImageCrop : null;
      imageFile = formData.get("image") as File | null;
      const original = formData.get("originalImage");
      originalImageFile = original instanceof File && original.size > 0 ? original : null;
      const poster = formData.get("posterImage");
      posterFile = poster instanceof File && poster.size > 0 ? poster : null;
      imageUrl = eventData.imageUrl;

      if (originalImageFile) {
        const bytes = new Uint8Array(await originalImageFile.arrayBuffer());
        const validation = validateOriginalEventImageFile(
          originalImageFile.name,
          originalImageFile.type,
          bytes,
          originalImageFile.size,
        );
        if (!validation.ok || validation.kind !== "image") {
          return withExtensionCors(
            NextResponse.json({ error: validation.ok ? "La sorgente deve essere un’immagine" : validation.error }, { status: 400 }),
            request,
          );
        }
        fingerprint = posterFingerprint(bytes);
      }
      if (!originalImageFile) {
        const posterSource = posterFile || imageFile;
        if (posterSource && posterSource.size <= MAX_ORIGINAL_EVENT_IMAGE_BYTES) {
          const bytes = new Uint8Array(await posterSource.arrayBuffer());
          const validation = validateOriginalEventImageFile(posterSource.name, posterSource.type, bytes, posterSource.size);
          if (validation.ok && validation.kind === "image") fingerprint = posterFingerprint(bytes);
        }
      }
      if (originalImageFile) {
        const uploaded = await uploadOriginalEventImageToSupabase(originalImageFile);
        uploadedOriginalPath = uploaded.storagePath;
        originalImageUrl = uploaded.url;
      } else {
        originalImageUrl = imageUrl;
      }

      // Upload image to Supabase if provided
      if (imageFile) {
        console.log("[API /events POST] Uploading image to Supabase...");
        imageUrl = await uploadImageToSupabase(imageFile, "events");
        console.log("[API /events POST] Image uploaded to Supabase:", imageUrl);
        if (!originalImageFile) originalImageUrl = imageUrl;
      }
    } else {
      return withExtensionCors(
        NextResponse.json(
          { error: "Unsupported Content-Type" },
          { status: 400 },
        ),
        request,
      );
    }

    // Recupera la sessione per collegare l'evento all'utente loggato (se presente)
    const session: any = await getServerSession(authOptions as any);

    // Ensure all fields are present with proper defaults
    const eventDataToSave: any = {
      title: eventData.title || "",
      description: eventData.description || "",
      // Stored as YYYY-MM-DD: list queries filter dates with string comparison.
      date: toIsoDate(eventData.date || ""),
      time: eventData.time || "",
      location: eventData.location || "",
      organizer: eventData.organizer || "",
      category: (eventData.category || "other").toLowerCase().trim(),
      price: eventData.price || "",
      ...seoFields,
      eventStatus: seoFields.eventStatus ?? "Scheduled",
      rawText: typeof eventData.rawText === "string" ? eventData.rawText : "",
      imageUrl: imageUrl || null,
      originalImageUrl: originalImageUrl || imageUrl || null,
      originalImageCropX: originalImageCrop?.x ?? null,
      originalImageCropY: originalImageCrop?.y ?? null,
      originalImageCropWidth: originalImageCrop?.width ?? null,
      originalImageCropHeight: originalImageCrop?.height ?? null,
      sourceUrl: eventData.sourceUrl || null,
      origin: "user",
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

    const publish = () => prisma.$transaction(async tx => {
      await lockEventDates(tx, [eventDataToSave.date]);
      const duplicate = await findDuplicateEvent({ ...eventDataToSave, posterImageUrl: eventData.imageUrl, posterFingerprint: fingerprint }, tx);
      if (duplicate) return { duplicate, saved: null };
      const saved = await createEventWithSeries(eventDataToSave, eventData.seriesTitle, tx);
      await savePosterFingerprint(tx, saved.event.id, fingerprint);
      return { duplicate: null, saved };
    });
    let publication;
    try {
      publication = await publish();
    } catch (error) {
      const conflict = error as { code?: string; meta?: { target?: unknown } };
      if (conflict.code !== 'P2002' || !Array.isArray(conflict.meta?.target) || !conflict.meta.target.includes('slug')) throw error;
      publication = await publish();
    }
    if (!publication.saved) {
      const { duplicate } = publication;
      if (uploadedOriginalPath) {
        await deleteEventMediaFromSupabase(uploadedOriginalPath).catch(cleanupError => {
          console.error("[API /events POST] Duplicate original cleanup failed:", cleanupError);
        });
        uploadedOriginalPath = null;
      }
      console.log(
        "[API /events POST] Duplicate event detected, skipping create. Existing ID:",
        duplicate.id,
      );
      return withExtensionCors(
        NextResponse.json(
          {
            error: "EVENT_DUPLICATE",
            message: `Questo evento esiste già: "${duplicate.title}" (${duplicate.date}).`,
            existingEventId: duplicate.id,
            existingEventSlug: duplicate.slug,
          },
          { status: 409 },
        ),
        request,
      );
    }

    console.log(
      "[API /events POST] Saving event with data:",
      JSON.stringify(eventDataToSave, null, 2),
    );

    const { event, seriesSlug } = publication.saved;
    uploadedOriginalPath = null;
    scheduleCalendarDeliveries();

    console.log("[API /events POST] Event saved successfully, ID:", event.id);

    const eventSlug = generateUniqueSlug(event.title, event.id);
    if (event.isPublished) invalidatePublicEvents({ slug: eventSlug, seriesSlug: seriesSlug ?? undefined });

    after(async () => {
      const tasks = [async () => {
        if (!event.location) return;
        const coords = await geocodeLocation(event.location);
        if (coords.latitude === null || coords.longitude === null) return;
        const updated = await prisma.event.updateMany({
          where: {
            id: event.id, location: event.location, updatedAt: event.updatedAt,
            latitude: event.latitude, longitude: event.longitude,
          },
          data: coords,
        });
        if (updated.count && event.isPublished) invalidatePublicEvents({ slug: eventSlug, seriesSlug: seriesSlug ?? undefined });
      }, async () => {
        if (posterFile && imageUrl) {
          await attachPosterImage(event.id, posterFile);
          if (event.isPublished) invalidatePublicEvents({ slug: eventSlug, seriesSlug: seriesSlug ?? undefined });
        }
      }, async () => {
        if (typeof eventData.scanFeedbackToken === "string") {
          const learned = await recordScanCorrections(
            eventData.scanFeedbackToken,
            eventDataToSave,
            eventDataToSave.createdById ?? null,
          );
          if (learned) console.log(`[API /events POST] Learned ${learned} scan correction(s)`);
        }
      }];
      await Promise.all(tasks.map(async task => {
        try {
          await task();
        } catch (error) {
          if (uploadedOriginalPath) {
            await deleteEventMediaFromSupabase(uploadedOriginalPath).catch(cleanupError => {
              console.error("[API /events POST] Original image cleanup failed:", cleanupError);
            });
          }
          console.warn("[API /events POST] Event saved; background task unavailable:", error);
        }
      }));
    });

    return withExtensionCors(
      NextResponse.json(
        { ...event, slug: eventSlug },
        {
          status: 201,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        },
      ),
      request,
    );
  } catch (error) {
    console.error("[API /events POST] Error saving event:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return withExtensionCors(
      NextResponse.json(
        {
          error: "Failed to save event",
          details: errorMessage,
        },
        { status: 500 },
      ),
      request,
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const category = searchParams.get("category");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const limit = searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!)
      : 20;
    const userIdParam = searchParams.get("userId");
    const includeDrafts = searchParams.get("includeDrafts") === "true";
    let includeDraftEvents = false;
    if (includeDrafts) {
      const session: any = await getServerSession(authOptions as any);
      if (!session?.user) {
        return NextResponse.json({ error: "Non autorizzato" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
      }
      if (!isAdminSession(session)) {
        return NextResponse.json({ error: "Accesso negato" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
      }
      includeDraftEvents = true;
    }

    const where: Prisma.EventWhereInput = {};
    if (!includeDraftEvents) where.isPublished = true;

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    if (category) {
      where.category = category;
    }

    const includePast = searchParams.get("includePast") === "true";
    const todayStr = calendarToday();

    // By default, never return past events unless includePast=true is explicitly passed.
    // When includePast is false, the effective dateFrom is at least today.
    if (!includePast) {
      const effectiveDateFrom = dateFrom && dateFrom > todayStr ? dateFrom : todayStr;
      where.date = { gte: effectiveDateFrom };
      if (dateTo) where.date.lte = dateTo;
    } else if (dateFrom || dateTo) {
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

    const events = includeDraftEvents || userIdParam
      ? await getEvents(where, limit)
      : await getCachedEvents(where, limit);

    // If this is a global listing (no specific userId), de-duplicate
    // events by (title, date, location), keeping only the first
    let responseEvents = events;
    if (!userIdParam && !includeDraftEvents) {
      const seenKeys = new Set<string>();
      responseEvents = events.filter((event) => {
        const key = `${(event.title || "").trim()}|||${(event.date || "").trim()}|||${(event.location || "").trim()}`;
        if (!key.trim()) return true; // if key is empty, don't dedupe aggressively
        if (seenKeys.has(key)) {
          return false;
        }
        seenKeys.add(key);
        return true;
      });
    }

    const publicEvents = responseEvents.map(redactOriginalEventImageMetadata);

    return NextResponse.json(publicEvents, {
      headers: {
        "Cache-Control": userIdParam || includeDraftEvents
          ? "private, no-store"
          : "public, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 },
    );
  }
}
