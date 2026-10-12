import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseEventIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value.map(Number))];
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) return null;
  return ids;
}

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const [series, events] = await Promise.all([
    prisma.eventSeries.findMany({
      include: {
        events: {
          select: { id: true, title: true, date: true, time: true, location: true },
          orderBy: [{ date: "asc" }, { time: "asc" }],
        },
        _count: { select: { events: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.event.findMany({
      select: { id: true, title: true, date: true, time: true, location: true, eventSeriesId: true },
      orderBy: [{ date: "asc" }, { time: "asc" }],
      take: 1000,
    }),
  ]);

  return NextResponse.json({ series, events }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const slug = slugify(typeof body.slug === "string" && body.slug.trim() ? body.slug : title);
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const eventIds = parseEventIds(body.eventIds);
    const id = body.id === undefined ? null : Number(body.id);

    if (!title || title.length > 160 || !slug || slug.length > 180) {
      return NextResponse.json({ error: "Titolo o slug non valido" }, { status: 400 });
    }
    if (description.length > 12000 || !eventIds || eventIds.length > 1000) {
      return NextResponse.json({ error: "Descrizione o selezione eventi non valida" }, { status: 400 });
    }
    if (id !== null && (!Number.isSafeInteger(id) || id <= 0)) {
      return NextResponse.json({ error: "ID rassegna non valido" }, { status: 400 });
    }

    const [slugOwner, selectedEvents] = await Promise.all([
      prisma.eventSeries.findUnique({ where: { slug }, select: { id: true } }),
      eventIds.length
        ? prisma.event.findMany({ where: { id: { in: eventIds } }, select: { id: true } })
        : Promise.resolve([]),
    ]);
    if (slugOwner && slugOwner.id !== id) {
      return NextResponse.json({ error: "Questo slug è già utilizzato" }, { status: 409 });
    }
    if (selectedEvents.length !== eventIds.length) {
      return NextResponse.json({ error: "Uno o più eventi selezionati non esistono" }, { status: 400 });
    }

    const series = await prisma.$transaction(async (transaction) => {
      const saved = id === null
        ? await transaction.eventSeries.create({
            data: { title, slug, description, isPublished: body.isPublished === true },
          })
        : await transaction.eventSeries.update({
            where: { id },
            data: { title, slug, description, isPublished: body.isPublished === true },
          });

      await transaction.event.updateMany({
        where: { eventSeriesId: saved.id, id: { notIn: eventIds } },
        data: { eventSeriesId: null },
      });
      if (eventIds.length > 0) {
        await transaction.event.updateMany({
          where: { id: { in: eventIds } },
          data: { eventSeriesId: saved.id },
        });
      }

      return transaction.eventSeries.findUnique({
        where: { id: saved.id },
        include: {
          events: {
            select: { id: true, title: true, date: true, time: true, location: true },
            orderBy: [{ date: "asc" }, { time: "asc" }],
          },
          _count: { select: { events: true } },
        },
      });
    });

    if (!series) throw new Error("Rassegna salvata ma non riletta");
    revalidatePath("/rassegne");
    revalidatePath(`/rassegne/${series.slug}`);
    for (const eventId of eventIds) {
      revalidatePath(`/events/${eventId}`);
    }

    return NextResponse.json(series, { status: id === null ? 201 : 200 });
  } catch (error) {
    console.error("[API /admin/event-series] Save failed:", error);
    return NextResponse.json({ error: "Impossibile salvare la rassegna" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "ID rassegna non valido" }, { status: 400 });
  }

  const existing = await prisma.eventSeries.findUnique({ where: { id }, select: { slug: true } });
  if (!existing) {
    return NextResponse.json({ error: "Rassegna non trovata" }, { status: 404 });
  }
  await prisma.eventSeries.delete({ where: { id } });
  revalidatePath("/rassegne");
  revalidatePath(`/rassegne/${existing.slug}`);
  return NextResponse.json({ ok: true });
}