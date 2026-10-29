import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "../app/lib/prisma";
import { calendarToday } from "./calendar-view";
import { parseEventDate } from "./calendar-ics";
import { DateTime } from "luxon";
import type { DbEvent } from "../app/types/event";

export type PublicCalendarEvent = Pick<DbEvent, "id" | "title" | "date" | "time" | "location" | "imageUrl" | "category">;
export type PublicListEvent = PublicCalendarEvent & Pick<DbEvent, "description" | "organizer" | "category" | "price">;

const calendarSelect = {
  id: true, title: true, date: true, time: true, location: true, imageUrl: true, category: true,
} as const;

function normalizePublicEvents<Event extends PublicCalendarEvent>(events: Event[], today: string, range: "today" | "upcoming" = "upcoming"): Event[] {
  return events.flatMap(event => {
    if (event.date.includes("T") && !DateTime.fromISO(event.date.trim(), { setZone: true }).isValid) return [];
    const parts = parseEventDate(event.date);
    if (!parts) return [];
    const date = `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
    return date >= today && (range !== "today" || date === today) ? [{ ...event, date }] : [];
  }).sort((first, second) => first.date.localeCompare(second.date) || first.time.localeCompare(second.time) || first.id - second.id).slice(0, 200);
}

const cachedList = unstable_cache(async (today: string, range: "today" | "upcoming") => {
  const events = await prisma.event.findMany({
    where: { OR: [{ date: { gte: today } }, { date: { contains: "/" } }] },
    select: { ...calendarSelect, description: true, organizer: true, category: true, price: true },
    orderBy: [{ date: "asc" }, { time: "asc" }, { id: "asc" }],
    take: 2000,
  });
  return normalizePublicEvents(events, today, range);
}, ["public-event-list"], { tags: ["events-list"], revalidate: 60 });

const cachedCalendar = unstable_cache(async (today: string) => {
  const events = await prisma.event.findMany({
    where: { OR: [{ date: { gte: today } }, { date: { contains: "/" } }] },
    select: calendarSelect,
    orderBy: [{ date: "asc" }, { time: "asc" }, { id: "asc" }],
    take: 2000,
  });
  return normalizePublicEvents(events, today);
}, ["public-event-calendar"], { tags: ["events-list"], revalidate: 60 });

export async function getPublicEventList(range: "today" | "upcoming" = "upcoming", today = calendarToday()): Promise<PublicListEvent[] | undefined> {
  try {
    return await cachedList(today, range);
  } catch {
    console.warn("Public event list temporarily unavailable");
    return undefined;
  }
}

export async function getPublicCalendarEvents(today = calendarToday()): Promise<PublicCalendarEvent[] | undefined> {
  try {
    return await cachedCalendar(today);
  } catch {
    console.warn("Public event calendar temporarily unavailable");
    return undefined;
  }
}