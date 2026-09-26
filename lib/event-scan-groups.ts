export type ScanEvent = {
  origin: string;
  createdAt: Date | string;
};

export type ScanDayGroup<T extends ScanEvent> = {
  key: string | null;
  label: string;
  events: T[];
};

export type ScanOriginGroup<T extends ScanEvent> = {
  origin: "user" | "cron";
  label: string;
  days: ScanDayGroup<T>[];
};

const scanDateFormatter = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "long",
  timeZone: "Europe/Rome",
});
const scanDateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Europe/Rome",
});

function getValidScanDate(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getScanDateKey(date: Date): string {
  const parts = scanDateKeyFormatter.formatToParts(date);
  const part = (type: string) =>
    parts.find((datePart) => datePart.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function groupEventsByScanOriginAndDate<T extends ScanEvent>(
  events: T[],
  isAdmin: boolean,
): ScanOriginGroup<T>[] {
  const eventsByOrigin = new Map<"user" | "cron", Map<string, ScanDayGroup<T>>>([
    ["user", new Map()],
    ["cron", new Map()],
  ]);

  for (const event of events) {
    const origin = event.origin === "user" ? "user" : "cron";
    const date = getValidScanDate(event.createdAt);
    const dateKey = date ? getScanDateKey(date) : null;
    const groupKey = dateKey ?? "invalid";
    const originGroups = eventsByOrigin.get(origin)!;
    let dayGroup = originGroups.get(groupKey);

    if (!dayGroup) {
      dayGroup = {
        key: dateKey,
        label: date ? scanDateFormatter.format(date) : "Data di scansione non valida",
        events: [],
      };
      originGroups.set(groupKey, dayGroup);
    }

    dayGroup.events.push(event);
  }

  return (["user", "cron"] as const)
    .map((origin) => {
      const days = [...eventsByOrigin.get(origin)!.values()].sort((a, b) => {
        if (a.key === null) return b.key === null ? 0 : 1;
        if (b.key === null) return -1;
        return b.key.localeCompare(a.key);
      });

      for (const day of days) {
        day.events.sort((a, b) => {
          const aTime = getValidScanDate(a.createdAt)?.getTime() ?? null;
          const bTime = getValidScanDate(b.createdAt)?.getTime() ?? null;
          if (aTime === null) return bTime === null ? 0 : 1;
          if (bTime === null) return -1;
          return bTime - aTime;
        });
      }

      return {
        origin,
        label:
          origin === "cron"
            ? "Scansionati dal cron"
            : isAdmin
              ? "Scansionati dagli utenti"
              : "Scansionati da me",
        days,
      };
    })
    .filter((group) => group.days.length > 0);
}
