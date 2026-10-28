import { DateTime } from "luxon";

export type CalendarView = "month" | "week" | "threeDays" | "day";
export const CALENDAR_ZONE = "Europe/Rome";

export function calendarToday(): string {
  return DateTime.now().setZone(CALENDAR_ZONE).toISODate()!;
}

export function calendarDays(anchor: string, view: CalendarView, todayKey = calendarToday()): (string | null)[] {
  const date = DateTime.fromISO(anchor, { zone: CALENDAR_ZONE });
  if (!date.isValid) return [];
  if (view === "month") {
    const today = DateTime.fromISO(todayKey, { zone: CALENDAR_ZONE }).startOf("day");
    const monthStart = date.startOf("month");
    const first = date.hasSame(today, "month")
      ? today.startOf("week")
      : monthStart.startOf("week");
    const daysToMonthEnd = Math.floor(monthStart.endOf("month").diff(first, "days").days) + 1;
    const count = Math.ceil(daysToMonthEnd / 7) * 7;
    return Array.from({ length: count }, (_, index) => first.plus({ days: index }).toISODate()!);
  }
  const first = view === "week" ? date.startOf("week") : date;
  const count = view === "week" ? 7 : view === "threeDays" ? 3 : 1;
  return Array.from({ length: count }, (_, index) => first.plus({ days: index }).toISODate()!);
}

export function moveCalendarDate(anchor: string, view: CalendarView, direction: -1 | 1): string {
  const date = DateTime.fromISO(anchor, { zone: CALENDAR_ZONE });
  return (view === "month" ? date.plus({ months: direction })
    : date.plus({ days: direction * (view === "week" ? 7 : view === "threeDays" ? 3 : 1) })).toISODate()!;
}

export function calendarDateLabel(key: string, options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric" }): string {
  return DateTime.fromISO(key, { zone: CALENDAR_ZONE }).setLocale("it").toLocaleString(options);
}

export function calendarPeriodLabel(anchor: string, view: CalendarView): string {
  if (view === "month") return calendarDateLabel(anchor, { month: "long", year: "numeric" });
  const days = calendarDays(anchor, view).filter((day): day is string => day !== null);
  if (view === "day") return calendarDateLabel(anchor);
  return `${calendarDateLabel(days[0], { day: "numeric", month: "short" })} - ${calendarDateLabel(days.at(-1)!, { day: "numeric", month: "short", year: "numeric" })}`;
}