export interface Coordinates {
  latitude: number | null;
  longitude: number | null;
}

interface NominatimResult {
  lat: string;
  lon: string;
  type?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    hamlet?: string;
  };
}

function normalizeLocality(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getExpectedLocality(location: string): string | null {
  const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
  while (
    parts.length > 1 &&
    /^(italia|italy|veneto|vicenza|vi)$/i.test(parts[parts.length - 1])
  ) {
    parts.pop();
  }

  if (parts.length < 2) return null;
  const locality = parts[parts.length - 1]
    .replace(/\b\d{5}\b/g, "")
    .replace(/\s*\([a-z]{2,3}\)\s*$/i, "")
    .trim();
  return locality || null;
}

function matchesLocality(result: NominatimResult, expectedLocality: string): boolean {
  const expected = normalizeLocality(expectedLocality);
  const resultLocalities = [
    result.address?.city,
    result.address?.town,
    result.address?.village,
    result.address?.municipality,
    result.address?.hamlet,
  ].filter((value): value is string => Boolean(value));

  return resultLocalities.some((locality) => normalizeLocality(locality) === expected);
}

function coordinatesFromResult(result: NominatimResult | undefined): Coordinates {
  if (!result) return { latitude: null, longitude: null };
  const latitude = Number.parseFloat(result.lat);
  const longitude = Number.parseFloat(result.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { latitude: null, longitude: null };
  }
  return { latitude, longitude };
}

const geocodeCache = new Map<string, Promise<Coordinates>>();
const MAX_GEOCODE_CACHE_ENTRIES = 500;

function isLikelyAddress(location: string): boolean {
  if (!location) return false;
  const trimmed = location.trim();
  if (!trimmed) return false;
  // At least 3 letters somewhere in the string
  return /[a-zA-Z]{3,}/.test(trimmed);
}

export async function geocodeLocation(location: string): Promise<Coordinates> {
  if (!isLikelyAddress(location)) {
    return { latitude: null, longitude: null };
  }

  const cacheKey = normalizeLocality(location);
  const cachedResult = geocodeCache.get(cacheKey);
  if (cachedResult) return cachedResult;

  const resultPromise = resolveLocation(location);
  geocodeCache.set(cacheKey, resultPromise);
  if (geocodeCache.size > MAX_GEOCODE_CACHE_ENTRIES) {
    const oldestKey = geocodeCache.keys().next().value;
    if (oldestKey) geocodeCache.delete(oldestKey);
  }

  const result = await resultPromise;
  if (
    (result.latitude === null || result.longitude === null) &&
    geocodeCache.get(cacheKey) === resultPromise
  ) {
    geocodeCache.delete(cacheKey);
  }
  return result;
}

async function resolveLocation(location: string): Promise<Coordinates> {
  try {
    const expectedLocality = getExpectedLocality(location);
    const searchNominatim = async (query: string): Promise<NominatimResult[]> => {
      const params = new URLSearchParams({
        format: "jsonv2",
        q: query,
        countrycodes: "it",
        addressdetails: "1",
        limit: "5",
      });
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        { headers: { "User-Agent": "EventScanner/1.0 (server)" } },
      );
      if (!response.ok) return [];
      const data = (await response.json()) as NominatimResult[];
      return Array.isArray(data) ? data : [];
    };

    const results = await searchNominatim(location);
    if (!expectedLocality) return coordinatesFromResult(results[0]);

    const matchingResult = results.find((result) =>
      matchesLocality(result, expectedLocality),
    );
    if (matchingResult) return coordinatesFromResult(matchingResult);

    const localityResults = await searchNominatim(`${expectedLocality}, Vicenza, Italia`);
    const matchingLocalityResults = localityResults.filter((result) =>
      matchesLocality(result, expectedLocality),
    );
    const localityResult =
      matchingLocalityResults.find((result) =>
        ["city", "town", "village", "hamlet"].includes(result.type ?? ""),
      ) ?? matchingLocalityResults[0];
    return coordinatesFromResult(localityResult);
  } catch {
    // Silenzia l'errore lato server: se la geocodifica fallisce, lasciamo i campi null
    return { latitude: null, longitude: null };
  }
}

export { isLikelyAddress };
