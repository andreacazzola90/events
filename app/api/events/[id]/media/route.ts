import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../../../../pages/api/auth/[...nextauth]";
import { deleteEventMediaFromSupabase, uploadEventMediaToSupabase } from "../../../../lib/supabase";
import { MAX_EVENT_ATTACHMENTS, MAX_EVENT_MEDIA_REQUEST_BYTES, validateEventMediaFile } from "../../../../../lib/event-media";

function isAdminSession(session: any): boolean {
  const user = session?.user as any;
  const email = (user?.email || "").toLowerCase();
  return user?.role === "admin" || user?.type === "admin" ||
    email === "andreacazzola90@gmail.com";
}

class EventMediaLimitError extends Error {}
class EventMediaRequestTooLargeError extends Error {}

async function parseMediaFormData(request: NextRequest) {
  const body = request.body;
  if (!body) throw new Error("Richiesta media vuota");
  const reader = body.getReader();
  let totalBytes = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_EVENT_MEDIA_REQUEST_BYTES) {
      await reader.cancel();
      throw new EventMediaRequestTooLargeError();
    }
    chunks.push(value);
  }
  const bodyBytes = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
  const boundedRequest = new Request(request.url, { method: "POST", headers: request.headers, body: bodyBytes });
  return boundedRequest.formData();
}

async function getAuthorizedEvent(eventId: number) {
  const session: any = await getServerSession(authOptions as any);
  if (!session?.user) return { response: NextResponse.json({ error: "Non autorizzato" }, { status: 401 }) };
  const userId = Number((session.user as any).id);
  if (!Number.isSafeInteger(userId)) return { response: NextResponse.json({ error: "Sessione non valida" }, { status: 401 }) };
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, createdById: true } });
  if (!event) return { response: NextResponse.json({ error: "Evento non trovato" }, { status: 404 }) };
  if (!isAdminSession(session) && event.createdById !== userId) {
    return { response: NextResponse.json({ error: "Non puoi modificare questo evento" }, { status: 403 }) };
  }
  return { event };
}

function parseEventId(rawId: string) {
  const id = Number(rawId);
  return /^\d+$/.test(rawId) && Number.isSafeInteger(id) ? id : null;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const eventId = parseEventId(rawId);
    if (!eventId) return NextResponse.json({ error: "ID evento non valido" }, { status: 400 });
    const authorization = await getAuthorizedEvent(eventId);
    if (authorization.response) return authorization.response;

    let formData: FormData;
    try {
      formData = await parseMediaFormData(request);
    } catch (error) {
      if (error instanceof EventMediaRequestTooLargeError) {
        return NextResponse.json({ error: "La richiesta media supera il limite consentito" }, { status: 413 });
      }
      return NextResponse.json({ error: "Richiesta media non valida" }, { status: 400 });
    }
    const file = formData.get("file");
    const kind = formData.get("kind");
    if (!(file instanceof File) || (kind !== "cover" && kind !== "image" && kind !== "pdf")) {
      return NextResponse.json({ error: "File o tipo media non valido" }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = validateEventMediaFile(file.name, file.type, bytes, file.size);
    if (!validation.ok || (kind === "pdf" ? validation.kind !== "pdf" : validation.kind !== "image")) {
      return NextResponse.json({ error: validation.ok ? "Tipo media non coerente" : validation.error }, { status: 400 });
    }
    if (kind === "cover" && validation.kind !== "image") {
      return NextResponse.json({ error: "La copertina deve essere un’immagine" }, { status: 400 });
    }
    if (kind !== "cover") {
      const count = await prisma.eventMedia.count({ where: { eventId } });
      if (count >= MAX_EVENT_ATTACHMENTS) {
        return NextResponse.json({ error: `Puoi aggiungere al massimo ${MAX_EVENT_ATTACHMENTS} allegati` }, { status: 400 });
      }
    }

    const uploaded = await uploadEventMediaToSupabase(file, eventId);
    try {
      if (kind === "cover") {
        const event = await prisma.event.update({ where: { id: eventId }, data: { imageUrl: uploaded.url } });
        return NextResponse.json({ imageUrl: event.imageUrl });
      }
      const media = await prisma.$transaction(async transaction => {
        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(${eventId})`;
        const count = await transaction.eventMedia.count({ where: { eventId } });
        if (count >= MAX_EVENT_ATTACHMENTS) throw new EventMediaLimitError();
        const lastMedia = await transaction.eventMedia.aggregate({ where: { eventId }, _max: { position: true } });
        return transaction.eventMedia.create({
          data: {
            eventId,
            kind: validation.kind,
            fileName: file.name.split(/[\\/]/).pop()?.slice(-180) || "Allegato",
            mimeType: file.type,
            sizeBytes: file.size,
            storagePath: uploaded.storagePath,
            url: uploaded.url,
            position: (lastMedia._max.position ?? -1) + 1,
          },
        });
      });
      return NextResponse.json(media, { status: 201 });
    } catch (error) {
      await deleteEventMediaFromSupabase(uploaded.storagePath).catch(() => {
        console.error("[API /events/[id]/media] Cleanup upload fallito");
      });
      if (error instanceof EventMediaLimitError) {
        return NextResponse.json({ error: `Puoi aggiungere al massimo ${MAX_EVENT_ATTACHMENTS} allegati` }, { status: 400 });
      }
      throw error;
    }
  } catch (error) {
    console.error("[API /events/[id]/media POST] Error:", error);
    return NextResponse.json({ error: "Impossibile caricare il media" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const eventId = parseEventId(rawId);
    if (!eventId) return NextResponse.json({ error: "ID evento non valido" }, { status: 400 });
    const authorization = await getAuthorizedEvent(eventId);
    if (authorization.response) return authorization.response;
    const mediaId = Number(request.nextUrl.searchParams.get("mediaId"));
    if (!Number.isSafeInteger(mediaId) || mediaId <= 0) {
      return NextResponse.json({ error: "ID media non valido" }, { status: 400 });
    }
    const media = await prisma.eventMedia.findFirst({ where: { id: mediaId, eventId } });
    if (!media) return NextResponse.json({ error: "Allegato non trovato" }, { status: 404 });
    await deleteEventMediaFromSupabase(media.storagePath);
    await prisma.eventMedia.delete({ where: { id: mediaId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /events/[id]/media DELETE] Error:", error);
    return NextResponse.json({ error: "Impossibile rimuovere l’allegato" }, { status: 500 });
  }
}
