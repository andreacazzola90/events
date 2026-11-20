import type { Coordinates, GeocodingOptions } from "./geocoding";

type EventCoordinateCandidate = {
  id: number;
  location: string;
  latitude: number | null;
  longitude: number | null;
  updatedAt: Date;
};

type EventBackfillDatabase = {
  event: {
    findMany: (query: unknown) => Promise<EventCoordinateCandidate[]>;
    updateMany: (query: unknown) => Promise<{ count: number }>;
  };
};

type Geocode = (
  location: string,
  options?: GeocodingOptions,
) => Promise<Coordinates>;

export type EventCoordinateBackfillResult = {
  dryRun: boolean;
  candidates: number;
  resolved: number;
  updated: number;
  clearedInvalid: number;
  unresolved: number;
  unresolvedEventIds: number[];
  concurrentChanges: number;
  failed: number;
  failedEventIds: number[];
  failedEventErrors: { eventId: number; errorType: string; errorCode?: string }[];
};

function isValidCoordinates(
  coordinates: Coordinates,
): coordinates is { latitude: number; longitude: number } {
  return (
    isValidLatitude(coordinates.latitude) &&
    isValidLongitude(coordinates.longitude)
  );
}

function isValidLatitude(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180;
}

function getSafeErrorDetails(error: unknown) {
  const errorType =
    error !== null &&
    typeof error === "object" &&
    "name" in error &&
    typeof error.name === "string"
      ? error.name
      : "UnknownError";
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return { errorType, errorCode: error.code };
  }
  return { errorType };
}

export function createNominatimRequestPacer(
  now: () => number = Date.now,
  sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): () => Promise<void> {
  let lastRequestAt: number | null = null;

  return async () => {
    if (lastRequestAt !== null) {
      const elapsed = now() - lastRequestAt;
      if (elapsed < 1_000) await sleep(1_000 - elapsed);
    }
    lastRequestAt = now();
  };
}

export async function backfillEventCoordinates(options: {
  database: EventBackfillDatabase;
  apply: boolean;
  geocode: Geocode;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  onProgress?: (completed: number, total: number) => void;
}): Promise<EventCoordinateBackfillResult> {
  const events = await options.database.event.findMany({
    where: {
      isPublished: true,
      OR: [
        { latitude: null },
        { longitude: null },
        { latitude: { lt: -90 } },
        { latitude: { gt: 90 } },
        { longitude: { lt: -180 } },
        { longitude: { gt: 180 } },
      ],
    },
    select: {
      id: true,
      location: true,
      latitude: true,
      longitude: true,
      updatedAt: true,
    },
    orderBy: { id: "asc" },
  });

  const result: EventCoordinateBackfillResult = {
    dryRun: !options.apply,
    candidates: events.length,
    resolved: 0,
    updated: 0,
    clearedInvalid: 0,
    unresolved: 0,
    unresolvedEventIds: [],
    concurrentChanges: 0,
    failed: 0,
    failedEventIds: [],
    failedEventErrors: [],
  };
  if (!options.apply) return result;

  const beforeRequest = createNominatimRequestPacer(options.now, options.sleep);
  const clearInvalidComponents = async (event: EventCoordinateCandidate) => {
    const data: Partial<Coordinates> = {};
    if (event.latitude !== null && !isValidLatitude(event.latitude)) data.latitude = null;
    if (event.longitude !== null && !isValidLongitude(event.longitude)) data.longitude = null;
    if (Object.keys(data).length === 0) return;

    const update = await options.database.event.updateMany({
      where: {
        id: event.id,
        isPublished: true,
        location: event.location,
        updatedAt: event.updatedAt,
        latitude: event.latitude,
        longitude: event.longitude,
      },
      data,
    });
    if (update.count === 1) result.clearedInvalid++;
    else result.concurrentChanges++;
  };

  for (const [index, event] of events.entries()) {
    try {
      if (!event.location.trim()) {
        result.unresolved++;
        result.unresolvedEventIds.push(event.id);
        await clearInvalidComponents(event);
      } else {
        const coordinates = await options.geocode(event.location, { beforeRequest });
        if (!isValidCoordinates(coordinates)) {
          result.unresolved++;
          result.unresolvedEventIds.push(event.id);
          await clearInvalidComponents(event);
        } else {
          result.resolved++;
          const update = await options.database.event.updateMany({
            where: {
              id: event.id,
              isPublished: true,
              location: event.location,
              updatedAt: event.updatedAt,
              latitude: event.latitude,
              longitude: event.longitude,
            },
            data: {
              latitude: isValidLatitude(event.latitude) ? event.latitude : coordinates.latitude,
              longitude: isValidLongitude(event.longitude) ? event.longitude : coordinates.longitude,
            },
          });
          if (update.count === 1) result.updated++;
          else result.concurrentChanges++;
        }
      }
    } catch (error) {
      result.failed++;
      result.unresolved++;
      result.failedEventIds.push(event.id);
      result.failedEventErrors.push({
        eventId: event.id,
        ...getSafeErrorDetails(error),
      });
      result.unresolvedEventIds.push(event.id);
    }
    options.onProgress?.(index + 1, events.length);
  }

  return result;
}
