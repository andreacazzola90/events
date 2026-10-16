import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock3,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  ZoomControl,
  useMap,
} from "react-leaflet";
import Image from "next/image";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { DbEvent } from "../../app/types/event";
import { AppIcon } from "./EventIcons";
import EventCategoryIcon from "./EventCategoryIcon";
import { STANDARD_CATEGORIES } from "../../lib/constants";
import { parseEventDate } from "../../lib/calendar-ics";
import { calendarToday } from "../../lib/calendar-view";
import { generateUniqueSlug } from "../../lib/slug-utils";

// Fix for default marker icons in Leaflet with Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

type EventData = DbEvent;

interface EventWithCoordinates extends EventData {
  lat?: number;
  lng?: number;
}

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const hasValidCoordinates = (lat: unknown, lng: unknown): boolean => {
  const validLat =
    typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90;
  const validLng =
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180;
  return validLat && validLng;
};

const isValidLatLngTuple = (
  coords: [unknown, unknown],
): coords is [number, number] => {
  return hasValidCoordinates(coords[0], coords[1]);
};

const DEFAULT_MAP_CENTER: [number, number] = [45.7175, 11.3593];
type MapDateFilter = "upcoming" | "today" | "tomorrow" | "weekend" | "week" | "custom";

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

// Component to control map view
function MapController({
  center,
  zoom,
}: {
  center: [number, number] | null;
  zoom: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!center || !isValidLatLngTuple(center)) return;

    const size = map.getSize();
    if (
      !Number.isFinite(size.x) ||
      !Number.isFinite(size.y) ||
      size.x <= 0 ||
      size.y <= 0
    ) {
      return;
    }

    try {
      map.flyTo(center, zoom, {
        duration: 1.5,
      });
    } catch {
      map.setView(center, zoom, { animate: false });
    }
  }, [center, map, zoom]);

  return null;
}

// Keep Leaflet responsive after route transitions/layout changes
function MapLifecycleController({
  center,
}: {
  center: [number, number] | null;
}) {
  const map = useMap();

  useEffect(() => {
    const refreshMap = () => {
      try {
        map.invalidateSize();
        if (center && isValidLatLngTuple(center)) {
          map.setView(center, map.getZoom(), { animate: false });
        }
      } catch {
        // Ignore transient map lifecycle errors during navigation
      }
    };

    const rafId = requestAnimationFrame(refreshMap);
    const timeoutA = window.setTimeout(refreshMap, 120);
    const timeoutB = window.setTimeout(refreshMap, 400);

    const handleResize = () => refreshMap();
    const handleVisibility = () => {
      if (!document.hidden) {
        refreshMap();
      }
    };

    window.addEventListener("resize", handleResize);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutA);
      window.clearTimeout(timeoutB);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [map, center]);

  return null;
}

export default function EventMap() {
  const [events, setEvents] = useState<EventWithCoordinates[]>([]);
  const [allEvents, setAllEvents] = useState<EventWithCoordinates[]>([]); // Store all events
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(
    DEFAULT_MAP_CENTER,
  );
  const [mapZoom, setMapZoom] = useState(14);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [isEventListOpen, setIsEventListOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [dateFilter, setDateFilter] = useState<MapDateFilter>("upcoming");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [organizerFilter, setOrganizerFilter] = useState("");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);

  // Geographic filter state
  const [filterCity, setFilterCity] = useState("");
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [maxDistance, setMaxDistance] = useState<number | null>(null); // null = show all
  const [isGeolocating, setIsGeolocating] = useState(false);

  const fetchEventsWithCoordinates = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/events");
      if (!response.ok) throw new Error("Failed to fetch events");

      const eventsData = await response.json();
      console.log("[EventMap] Fetched events from API:", eventsData.length);
      console.log(
        "[EventMap] Event locations:",
        eventsData.map((e: EventData) => ({
          title: e.title,
          location: e.location,
        })),
      );
      // Use precomputed coordinates stored in the database
      const eventsWithCoords: EventWithCoordinates[] = eventsData.map(
        (event: EventData) => {
          const lat = toFiniteNumber(event.latitude ?? (event as any).lat);
          const lng = toFiniteNumber(event.longitude ?? (event as any).lng);
          return { ...event, lat: lat ?? undefined, lng: lng ?? undefined };
        },
      );

      const validEvents = eventsWithCoords.filter((e) =>
        hasValidCoordinates(e.lat, e.lng),
      );
      console.log(
        "[EventMap] Events with valid coordinates:",
        validEvents.length,
        "/",
        eventsData.length,
      );
      console.log(
        "[EventMap] Valid events:",
        validEvents.map((e) => ({ title: e.title, lat: e.lat, lng: e.lng })),
      );
      console.log(
        "[EventMap] Filtered out events:",
        eventsWithCoords
          .filter((e) => !hasValidCoordinates(e.lat, e.lng))
          .map((e) => ({
            title: e.title,
            location: e.location,
            lat: e.lat,
            lng: e.lng,
          })),
      );

      // Store all events for filtering
      setAllEvents(validEvents);
      setEvents(validEvents);

      setLoading(false);
    } catch (err) {
      console.error("Error fetching events:", err);
      setError(
        "Errore nel caricamento degli eventi o nella geocodifica degli indirizzi. Alcuni eventi potrebbero non avere una posizione valida.",
      );
      setLoading(false);
    }
  };

  function calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function filterEvents() {
    const today = calendarToday();
    const needle = searchQuery.trim().toLocaleLowerCase("it");
    const filtered = allEvents.filter((event) => {
      const coords: [unknown, unknown] = [event.lat, event.lng];
      if (userLocation && maxDistance !== null) {
        if (!isValidLatLngTuple(coords)) return false;
        const distance = calculateDistance(
          userLocation.lat,
          userLocation.lng,
          coords[0],
          coords[1],
        );
        if (distance > maxDistance) return false;
      }

      const searchableText = [event.title, event.description, event.location]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("it");
      if (needle && !searchableText.includes(needle)) return false;
      if (categoryFilter && event.category !== categoryFilter) return false;
      if (organizerFilter && !(event.organizer || "").toLocaleLowerCase("it").includes(organizerFilter.toLocaleLowerCase("it"))) return false;

      const date = parseEventDate(event.date);
      if (!date) return false;
      const eventDate = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
      if (dateFilter === "upcoming" && eventDate < today) return false;
      if (dateFilter !== "upcoming" && dateFilter !== "custom") {
        const range = getDateRange(dateFilter, today);
        if (eventDate < range.start || eventDate > range.end) return false;
      }
      if (dateFrom && eventDate < dateFrom) return false;
      if (dateTo && eventDate > dateTo) return false;
      return true;
    });

    setEvents(filtered);
  }

  useEffect(() => {
    fetchEventsWithCoordinates();
  }, []);

  // Filter events when location or distance changes
  useEffect(() => {
    filterEvents();
  }, [allEvents, userLocation, maxDistance, searchQuery, categoryFilter, dateFilter, dateFrom, dateTo, organizerFilter]);

  // Disable Leaflet keyboard handling for input fields
  useEffect(() => {
    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        // Disable Leaflet keyboard handling
        const mapContainer = document.querySelector(".leaflet-container");
        if (mapContainer) {
          (mapContainer as any)._leaflet_map?.keyboard?.disable();
        }
      }
    };

    const handleBlur = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        // Re-enable Leaflet keyboard handling
        const mapContainer = document.querySelector(".leaflet-container");
        if (mapContainer) {
          (mapContainer as any)._leaflet_map?.keyboard?.enable();
        }
      }
    };

    document.addEventListener("focusin", handleFocus);
    document.addEventListener("focusout", handleBlur);

    return () => {
      document.removeEventListener("focusin", handleFocus);
      document.removeEventListener("focusout", handleBlur);
    };
  }, []);

  // Handle city search
  const handleCitySearch = async () => {
    if (!filterCity.trim()) return;

    setIsGeolocating(true);
    try {
      const coords = await geocodeLocation(filterCity);
      const latLng: [unknown, unknown] = [coords.lat, coords.lng];
      if (isValidLatLngTuple(latLng)) {
        setUserLocation({ lat: latLng[0], lng: latLng[1] });
        setMapCenter(latLng);
        setMapZoom(14);
        console.log(`[EventMap] City "${filterCity}" geocoded to:`, coords);
      } else {
        alert("Impossibile trovare la città. Riprova con un nome diverso.");
      }
    } catch (err) {
      console.error("Error geocoding city:", err);
      alert("Errore nella ricerca della città.");
    } finally {
      setIsGeolocating(false);
    }
  };

  // Handle geolocation
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      alert("La geolocalizzazione non è supportata dal tuo browser.");
      return;
    }

    setIsGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(location);
        setMapCenter([location.lat, location.lng]);
        setMapZoom(14);
        setFilterCity(""); // Clear city input
        console.log("[EventMap] User location:", location);
        setIsGeolocating(false);
      },
      (error) => {
        console.error("Geolocation error:", error);
        alert(
          "Impossibile ottenere la tua posizione. Assicurati di aver dato il permesso.",
        );
        setIsGeolocating(false);
      },
    );
  };

  // Clear filter
  const handleClearFilter = () => {
    setUserLocation(null);
    setMaxDistance(null);
    setFilterCity("");

    // Reset map center to Schio
    setMapCenter(DEFAULT_MAP_CENTER);
    setMapZoom(14);
  };

  const handleClearSearchFilters = () => {
    setSearchQuery("");
    setCategoryFilter("");
    setDateFilter("upcoming");
    setDateFrom("");
    setDateTo("");
    setOrganizerFilter("");
    handleClearFilter();
  };

  // Cache in-memory per la geocodifica
  const geocodeCache: Record<string, { lat: number; lng: number }> = {};

  const geocodeLocation = async (
    location: string,
  ): Promise<{ lat?: number; lng?: number }> => {
    if (geocodeCache[location]) {
      return geocodeCache[location];
    }
    try {
      // Using Nominatim (OpenStreetMap) for geocoding
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`,
        {
          headers: {
            "User-Agent": "EventScanner/1.0",
          },
        },
      );

      if (!response.ok) return {};

      const data = await response.json();
      if (data.length > 0) {
        const coords = {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
        };
        if (hasValidCoordinates(coords.lat, coords.lng)) {
          geocodeCache[location] = coords;
          return coords;
        }
      }
      return {};
    } catch {
      // Silenzia l'errore: non mostrare nulla in console, ignora l'evento
      return {};
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      if (!dateStr) return "Data non disponibile";

      let date: Date | undefined;

      // Handle DD/MM/YYYY format
      if (dateStr.includes("/")) {
        const parts = dateStr.split("/");
        if (parts.length === 3) {
          const day = parseInt(parts[0]);
          const month = parseInt(parts[1]) - 1; // Month is 0-indexed
          const year = parseInt(parts[2]);
          date = new Date(year, month, day);
        }
      } else {
        // Handle YYYY-MM-DD or other ISO formats
        date = new Date(dateStr);
      }

      // Check if date is valid
      if (!date || isNaN(date.getTime())) {
        return dateStr; // Return original string if parsing failed
      }

      return date.toLocaleDateString("it-IT", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const handleEventClick = (event: EventWithCoordinates) => {
    const coords: [unknown, unknown] = [event.lat, event.lng];
    if (isValidLatLngTuple(coords)) {
      setMapCenter(coords);
      setMapZoom(16);
      setSelectedEventId(event.id);
      setIsEventListOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-[#f5f2ec]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#d65a38] mx-auto mb-4"></div>
          <p className="text-[#5f5b56]">Caricamento mappa...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-[#fff7f4]">
        <div className="text-center">
          <p className="text-[#b84b2d]">{error}</p>
        </div>
      </div>
    );
  }

  if (allEvents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-[#f5f2ec]">
        <div className="text-center">
          <p className="text-[#5f5b56]">
            Nessun evento da visualizzare sulla mappa
          </p>
        </div>
      </div>
    );
  }

  const validatedMapCenter =
    mapCenter && isValidLatLngTuple(mapCenter) ? mapCenter : null;
  const mapInitialCenter = validatedMapCenter ?? DEFAULT_MAP_CENTER;

  return (
    <div className="event-map-shell relative h-full w-full overflow-hidden bg-[#f9f7f2]">
      <div className="absolute inset-0">
        <MapContainer
          center={mapInitialCenter}
          zoom={10}
          zoomControl={false}
          style={{ height: "100%", width: "100%" }}
          className="z-0"
        >
          <ZoomControl position="topright" />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapLifecycleController center={validatedMapCenter} />
          <MapController center={validatedMapCenter} zoom={mapZoom} />
          {events.map((event) => {
            const coords: [unknown, unknown] = [event.lat, event.lng];

            if (!isValidLatLngTuple(coords)) {
              return null;
            }

            return (
              <Marker
                key={event.id}
                position={coords}
                eventHandlers={{
                  click: () => handleEventClick(event),
                }}
              >
                <Popup maxWidth={300}>
                  <div className="p-2">
                    {event.imageUrl && (
                      <Image
                        src={event.imageUrl}
                        alt={event.title}
                        width={400}
                        height={300}
                        className="w-full h-48 object-cover rounded mb-2"
                        sizes="(min-width: 1024px) 25vw, 50vw"
                      />
                    )}
                    <h3 className="font-bold text-lg mb-1">
                      <Link href={`/events/${generateUniqueSlug(event.title, event.id)}`} className="hover:text-[#d65a38]">
                        {event.title}
                      </Link>
                    </h3>
                    <p className="text-sm text-gray-600 mb-2">
                      {event.description}
                    </p>
                    <div className="space-y-1 text-sm">
                      <p>
                        <strong>📅 Data:</strong> {formatDate(event.date)}
                      </p>
                      <p>
                        <strong>🕐 Ora:</strong> {event.time}
                      </p>
                      <p>
                        <strong>📍 Luogo:</strong> {event.location}
                      </p>
                      <p>
                        <strong>🎫 Prezzo:</strong> {event.price}
                      </p>
                      <p>
                        <strong>🏷️ Categoria:</strong> {event.category}
                      </p>
                    </div>
                    <a
                      href={`/events/${generateUniqueSlug(event.title, event.id)}`}
                      className="mt-3 block text-center bg-[#1d1d1b] text-white px-4 py-2 rounded-none hover:bg-[#d65a38] transition-colors"
                    >
                      Vedi Dettagli
                    </a>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      <div className={`event-map-legend ${isEventListOpen ? "is-open h-[72dvh]" : "is-closed h-auto"} absolute bottom-3 left-3 right-3 z-[500] flex flex-col overflow-hidden bg-[#fffdf9]/95 shadow-[0_20px_50px_rgba(29,29,27,0.08)] backdrop-blur-xl sm:bottom-6 sm:left-6 sm:right-auto sm:top-6 sm:w-[360px]`}>
        <div className="sticky top-0 z-20 shrink-0 space-y-4 border-b border-black/10 bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black text-[#1d1d1b] flex items-center gap-2 tracking-tight">
                <AppIcon name="map" className="h-5 w-5 text-[#d65a38]" /> Eventi
              </h2>
              <p className="text-[11px] font-bold text-[#5f5b56] mt-1 uppercase tracking-[0.16em]">
                {events.length}{" "}
                {userLocation ? `entro ${maxDistance || "∞"}km` : "risultati"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {userLocation && (
                <button
                  onClick={handleClearFilter}
                  className="flex h-10 w-10 items-center justify-center bg-[#f1eee7] text-[#1d1d1b] text-sm font-semibold transition-colors hover:bg-[#e8e4db]"
                  title="Rimuovi filtro"
                  aria-label="Rimuovi filtro geografico"
                >
                  <AppIcon name="close" className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsEventListOpen((open) => !open)}
                aria-expanded={isEventListOpen}
                aria-controls="map-event-list"
                aria-label={isEventListOpen ? "Chiudi lista eventi" : "Apri lista eventi"}
                title={isEventListOpen ? "Chiudi lista eventi" : "Apri lista eventi"}
                className="flex h-10 w-10 items-center justify-center bg-[#1d1d1b] text-white transition-colors hover:bg-[#d65a38] sm:hidden"
              >
                {isEventListOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div className={`${isEventListOpen ? "block" : "hidden"} space-y-3 sm:block`}>
            <label className="flex items-center gap-2 border border-black/10 bg-white px-3">
              <Search className="h-4 w-4 shrink-0 text-[#d65a38]" aria-hidden="true" />
              <input
                type="search"
                placeholder="Cerca eventi per titolo, descrizione o luogo"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                aria-label="Cerca eventi per titolo, descrizione o luogo"
                className="min-w-0 flex-1 py-2.5 text-sm text-[#1d1d1b] placeholder:text-[#7a756f] focus:outline-none"
              />
            </label>

            <label className="flex items-center gap-2 border border-black/10 bg-white px-3">
              <EventCategoryIcon category={categoryFilter} className="h-4 w-4 shrink-0 text-[#d65a38]" />
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                aria-label="Filtra per categoria"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-[#1d1d1b] focus:outline-none"
              >
                <option value="">Tutte le categorie</option>
                {STANDARD_CATEGORIES.map((category) => (
                  <option key={category} value={category}>{category.charAt(0).toUpperCase() + category.slice(1)}</option>
                ))}
              </select>
            </label>

            <div className="flex gap-1 overflow-x-auto pb-1" role="group" aria-label="Periodo eventi">
              {([
                { value: "upcoming", label: "Prossimi" },
                { value: "today", label: "Oggi" },
                { value: "tomorrow", label: "Domani" },
                { value: "weekend", label: "Weekend" },
                { value: "week", label: "7 giorni" },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={dateFilter === option.value}
                  onClick={() => {
                    setDateFilter(option.value);
                    setDateFrom("");
                    setDateTo("");
                  }}
                  className={`shrink-0 px-2.5 py-1.5 text-[10px] font-bold transition-colors ${dateFilter === option.value ? "bg-[#1d1d1b] text-white" : "bg-[#f1eee7] text-[#1d1d1b] hover:bg-[#e8e4db]"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setAdvancedFiltersOpen((open) => !open)}
                aria-expanded={advancedFiltersOpen}
                aria-controls="map-advanced-filters"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1d1d1b] underline underline-offset-4"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                {advancedFiltersOpen ? "Nascondi filtri" : "Altri filtri"}
              </button>
              {(searchQuery || categoryFilter || dateFrom || dateTo || organizerFilter || dateFilter !== "upcoming" || userLocation) && (
                <button type="button" onClick={handleClearSearchFilters} className="text-xs font-semibold text-[#8f3823] underline underline-offset-4">
                  Azzera filtri
                </button>
              )}
            </div>

            {advancedFiltersOpen && (
              <div id="map-advanced-filters" className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-[10px] font-semibold text-[#5f5b56]">
                  Dal
                  <input
                    type="date"
                    value={dateFrom}
                    min={calendarToday()}
                    onChange={(event) => { setDateFrom(event.target.value); setDateFilter("custom"); }}
                    aria-label="Data di inizio"
                    className="w-full border border-black/10 bg-white px-2 py-2 text-xs text-[#1d1d1b]"
                  />
                </label>
                <label className="space-y-1 text-[10px] font-semibold text-[#5f5b56]">
                  Al
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom || calendarToday()}
                    onChange={(event) => { setDateTo(event.target.value); setDateFilter("custom"); }}
                    aria-label="Data di fine"
                    className="w-full border border-black/10 bg-white px-2 py-2 text-xs text-[#1d1d1b]"
                  />
                </label>
                <label className="col-span-2 space-y-1 text-[10px] font-semibold text-[#5f5b56]">
                  Organizzatore
                  <input
                    type="search"
                    placeholder="Nome organizzatore"
                    value={organizerFilter}
                    onChange={(event) => setOrganizerFilter(event.target.value)}
                    aria-label="Organizzatore"
                    className="w-full border border-black/10 bg-white px-2 py-2 text-xs text-[#1d1d1b] placeholder:text-[#7a756f]"
                  />
                </label>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleUseMyLocation}
                disabled={isGeolocating}
                className="w-10 h-10 bg-[#1d1d1b] text-white hover:bg-[#d65a38] disabled:bg-[#d9d4cd] disabled:cursor-not-allowed transition-colors flex items-center justify-center shrink-0"
                title="Usa la mia posizione"
              >
                {isGeolocating ? <span className="map-control-spinner" aria-hidden="true" /> : <AppIcon name="locate" className="h-5 w-5" />}
              </button>
              <input
                type="text"
                placeholder="Cerca città..."
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleCitySearch()}
                onFocus={(e) => {
                  e.target.setAttribute("data-leaflet-disable-keyboard", "true");
                }}
                onBlur={(e) => {
                  e.target.removeAttribute("data-leaflet-disable-keyboard");
                }}
                className="flex-1 px-3 py-2 text-sm text-[#1d1d1b] placeholder:text-[#7a756f] border border-black/10 bg-white focus:outline-none focus:ring-2 focus:ring-[#d65a38] focus:border-transparent"
                disabled={isGeolocating}
              />
              <button
                onClick={handleCitySearch}
                disabled={isGeolocating || !filterCity.trim()}
                className="px-4 py-2 bg-[#d65a38] text-white text-sm font-semibold hover:bg-[#b84b2d] disabled:bg-[#d9d4cd] disabled:cursor-not-allowed transition-colors"
              >
                <AppIcon name="search" className="h-4 w-4" />
              </button>
            </div>

            {userLocation && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-[#5f5b56] uppercase tracking-[0.16em]">
                  Distanza massima
                </label>
                <div className="grid grid-cols-5 gap-1">
                  {[10, 25, 50, 100, null].map((distance) => (
                    <button
                      key={distance || "all"}
                      onClick={() => setMaxDistance(distance)}
                      className={`px-2 py-1.5 text-[10px] font-bold transition-colors ${
                        maxDistance === distance
                          ? "bg-[#1d1d1b] text-white"
                          : "bg-[#f1eee7] text-[#1d1d1b] hover:bg-[#e8e4db]"
                      }`}
                    >
                      {distance ? `${distance}km` : "Tutti"}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div id="map-event-list" className={`${isEventListOpen ? "flex" : "hidden"} min-h-0 flex-1 flex-col divide-y divide-black/10 overflow-y-auto custom-scrollbar sm:flex`}>
          {events.length === 0 ? (
            <p className="p-4 text-sm text-[#5f5b56]" role="status">Nessun evento trovato con questi filtri.</p>
          ) : events.map((event) => (
            <article
              key={event.id}
              data-event-id={event.id}
              className={`map-event-card flex items-center gap-2 px-2.5 py-2 transition-colors ${selectedEventId === event.id ? "bg-[#faf5f1]" : "hover:bg-[#faf5f1]"}`}
            >
              <button
                type="button"
                onClick={() => handleEventClick(event)}
                aria-pressed={selectedEventId === event.id}
                aria-label={`Centra sulla mappa: ${event.title}`}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                {event.imageUrl ? (
                  <Image
                    src={event.imageUrl}
                    alt=""
                    width={48}
                    height={48}
                    className="h-12 w-12 shrink-0 object-cover"
                    sizes="48px"
                  />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center bg-[#f1eee7] text-[#d65a38]">
                    <CalendarDays className="h-5 w-5" aria-hidden="true" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block line-clamp-1 text-sm font-bold leading-tight text-[#1d1d1b]">{event.title}</span>
                  <span className="mt-1 flex min-w-0 items-center gap-2 text-[10px] text-[#5f5b56]">
                    <span className="inline-flex shrink-0 items-center gap-1">
                      <CalendarDays className="h-3 w-3 text-[#d65a38]" aria-hidden="true" />
                      {formatDate(event.date)}
                    </span>
                    {event.time && <span className="inline-flex shrink-0 items-center gap-1"><Clock3 className="h-3 w-3" aria-hidden="true" />{event.time}</span>}
                    <span className="min-w-0 truncate">{event.location}</span>
                  </span>
                  <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold uppercase text-[#8f3823]">
                    <EventCategoryIcon category={event.category} className="h-3 w-3" />
                    {event.category}
                  </span>
                </span>
              </button>
              <Link
                href={`/events/${generateUniqueSlug(event.title, event.id)}`}
                aria-label={`Apri dettagli: ${event.title}`}
                title="Apri dettagli evento"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center bg-[#1d1d1b] text-white transition-colors hover:bg-[#d65a38]"
              >
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
        .leaflet-container {
          width: 100%;
          height: 100%;
        }
      `}</style>
    </div>
  );
}
