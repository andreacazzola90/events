import { parseEventDate } from "./calendar-ics";

export type MapDateFilter = "upcoming" | "today" | "tomorrow" | "weekend" | "week" | "custom";

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateRange(filter: Exclude<MapDateFilter, "upcoming" | "custom">, today: string) {
  const start = new Date(`${today}T12:00:00`);
  if (filter === "tomorrow") start.setDate(start.getDate() + 1);
  if (filter === "week") {
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start: toDateKey(start), end: toDateKey(end) };
  }
  if (filter === "weekend") {
    if (start.getDay() !== 0 && start.getDay() !== 6) {
      start.setDate(start.getDate() + (6 - start.getDay()));
    }
    const end = new Date(start);
    if (start.getDay() === 6) end.setDate(end.getDate() + 1);
    return { start: toDateKey(start), end: toDateKey(end) };
  }
  return { start: toDateKey(start), end: toDateKey(start) };
}

export function mapEventMatchesDateFilter(
  eventDate: string,
  filter: MapDateFilter,
  today: string,
  dateFrom = "",
  dateTo = "",
): boolean {
  const parts = parseEventDate(eventDate);
  if (!parts) return false;
  const date = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;

  if (filter === "upcoming" && date < today) return false;
  if (filter !== "upcoming" && filter !== "custom") {
    const range = getDateRange(filter, today);
    if (date < range.start || date > range.end) return false;
  }
  if (dateFrom && date < dateFrom) return false;
  if (dateTo && date > dateTo) return false;
  return true;
}
