export interface Coordinates {
  latitude: number | null;
  longitude: number | null;
}

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

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`,
      {
        headers: {
          'User-Agent': 'EventScanner/1.0 (server)',
        },
      },
    );

    if (!response.ok) {
      return { latitude: null, longitude: null };
    }

    const data: any[] = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      return { latitude: null, longitude: null };
    }

    const first = data[0];
    const lat = parseFloat(first.lat);
    const lon = parseFloat(first.lon);

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return { latitude: null, longitude: null };
    }

    return { latitude: lat, longitude: lon };
  } catch {
    // Silenzia l'errore lato server: se la geocodifica fallisce, lasciamo i campi null
    return { latitude: null, longitude: null };
  }
}

export { isLikelyAddress };
