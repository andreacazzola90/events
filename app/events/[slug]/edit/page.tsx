"use client";

import { useState, useEffect, useRef } from "react";
import { type Area } from "react-easy-crop";
import EventImageCropper from "../../../components/EventImageCropper";
import PageHeading from "../../../components/PageHeading";
import LoadingAnimation from "../../../components/LoadingAnimation";
import {
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
} from "../../../components/EventIcons";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  extractIdFromSlug,
  generateUniqueSlug,
} from "../../../../lib/slug-utils";
import { getCropOutputSize, MAX_EVENT_MEDIA_BYTES } from "../../../../lib/event-media";
import type { DbEvent } from "../../../types/event";
import type { DraftImageCropBox } from "../../../../lib/draft-image-crop";

type Event = DbEvent;
type EventMediaRecord = { id: number; kind: "image" | "pdf"; fileName: string; mimeType: string; sizeBytes: number; url: string; position: number };
type EditableEvent = Event & { media: EventMediaRecord[]; originalImageCrop?: DraftImageCropBox | null };

async function cropCoverToFile(imageSource: string, area: Area) {
  const image = new window.Image();
  image.crossOrigin = "anonymous";
  image.src = imageSource;
  await image.decode();
  const outputSize = getCropOutputSize(area.width, area.height);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize.width;
  canvas.height = outputSize.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Impossibile ritagliare l’immagine");
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, outputSize.width, outputSize.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error("Impossibile esportare l’immagine")), "image/jpeg", 0.82);
  });
  if (blob.size > MAX_EVENT_MEDIA_BYTES) throw new Error("Il ritaglio supera 4 MiB; riduci lo zoom o scegli un’immagine più leggera.");
  return new File([blob], `cover-${Date.now()}.jpg`, { type: "image/jpeg" });
}

// kept for reference only - matching fields were:
// id, title, description, date, time, location, organizer, category, price, rawText, imageUrl

export default function EditEventPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [event, setEvent] = useState<EditableEvent | null>(null);
  // Helper to convert DD/MM/YYYY to YYYY-MM-DD for input type=date
  function toInputDateFormat(date: string) {
    if (!date) return "";
    // If already in YYYY-MM-DD, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    // If in DD/MM/YYYY, convert
    const match = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) {
      const [, d, m, y] = match;
      return `${y}-${m}-${d}`;
    }
    return date;
  }
  // Helper to convert YYYY-MM-DD to DD/MM/YYYY for saving if needed
  function toDisplayDateFormat(date: string) {
    if (!date) return "";
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) return date;
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const [, y, m, d] = match;
      return `${d}/${m}/${y}`;
    }
    return date;
  }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [moderationBusy, setModerationBusy] = useState(false);
  const [moderationMessage, setModerationMessage] = useState<string | null>(null);
  const [newImage, setNewImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [originalImagePreview, setOriginalImagePreview] = useState<string | null>(null);
  const [originalImageFile, setOriginalImageFile] = useState<File | null>(null);
  const [originalImageCrop, setOriginalImageCrop] = useState<DraftImageCropBox | null>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropSelection, setCropSelection] = useState<DraftImageCropBox | null>(null);
  const [pendingMedia, setPendingMedia] = useState<File[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [pendingMediaPreviews, setPendingMediaPreviews] = useState<(string | null)[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const clearServiceWorkerCache = () => {
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "CLEAR_CACHE" });
    }
  };

  useEffect(() => {
    const previews = pendingMedia.map(file => file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
    setPendingMediaPreviews(previews);
    return () => previews.forEach(preview => preview && URL.revokeObjectURL(preview));
  }, [pendingMedia]);

  useEffect(() => {
    if (!imagePreview?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  useEffect(() => {
    if (!originalImagePreview?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(originalImagePreview);
  }, [originalImagePreview]);

  const fetchEvent = async (eventId: number) => {
    try {
      const response = await fetch(`/api/events/${eventId}`);
      if (response.ok) {
        const data = await response.json();
        // Convert date to input format if needed
        data.date = toInputDateFormat(data.date);
        const cropValues = [data.originalImageCropX, data.originalImageCropY, data.originalImageCropWidth, data.originalImageCropHeight];
        const crop = cropValues.every(value => typeof value === "number" && Number.isFinite(value))
          ? { x: cropValues[0], y: cropValues[1], width: cropValues[2], height: cropValues[3] }
          : null;
        data.originalImageCrop = crop;
        setOriginalImagePreview(data.originalImageUrl || null);
        setOriginalImageCrop(crop);
        setEvent({ ...data, media: Array.isArray(data.media) ? data.media : [] });
      } else {
        setError("Evento non trovato");
      }
    } catch {
      setError("Errore nel caricamento dell'evento");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (params && params.slug) {
      const eventId = extractIdFromSlug(params.slug as string);
      if (eventId) {
        fetchEvent(eventId);
      } else {
        setError("Invalid event URL");
        setLoading(false);
      }
    }
  }, [params?.slug]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (!event) return;
    let value = e.target.value;
    // If changing date, keep in YYYY-MM-DD for input, but convert to DD/MM/YYYY on save
    if (e.target.name === "date") {
      value = value; // keep as is for input
    }
    setEvent({ ...event, [e.target.name]: value });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMediaError("Scegli un’immagine JPEG, PNG o WebP fino a 4 MiB.");
      e.target.value = "";
      return;
    }
    setMediaError(null);
    setCroppedAreaPixels(null);
    const source = URL.createObjectURL(file);
    setNewImage(null);
    setImagePreview(null);
    setOriginalImageFile(file);
    setOriginalImagePreview(source);
    setCropSelection(null);
    setCropSource(source);
    e.target.value = "";
  };

  const handleAddMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !event) return;
    if (event.media.length + pendingMedia.length + files.length > 10) {
      setMediaError("Puoi aggiungere al massimo 10 immagini o PDF per evento.");
      e.target.value = "";
      return;
    }
    const invalid = files.find(file => file.size > 4 * 1024 * 1024 || ![
      "image/jpeg", "image/png", "image/webp", "application/pdf",
    ].includes(file.type));
    if (invalid) {
      setMediaError(`${invalid.name}: usa JPEG, PNG, WebP o PDF fino a 4 MiB.`);
      e.target.value = "";
      return;
    }
    setMediaError(null);
    setPendingMedia(current => [...current, ...files]);
    e.target.value = "";
  };

  const handleApplyCrop = async () => {
    if (!cropSource || !croppedAreaPixels) return;
    try {
      const croppedFile = await cropCoverToFile(cropSource, croppedAreaPixels);
      setNewImage(croppedFile);
      setImagePreview(URL.createObjectURL(croppedFile));
      setOriginalImageCrop(cropSelection);
      setEvent(current => current ? { ...current, originalImageCrop: cropSelection } : current);
      setCropSource(null);
      setMediaError(null);
    } catch {
      setMediaError("Impossibile ritagliare questa immagine o il ritaglio supera il limite di 4 MiB.");
    }
  };

  const handleOpenCropper = () => {
    const source = originalImagePreview || event?.originalImageUrl || imagePreview || event?.imageUrl;
    if (!source) return;
    setCropSource(source);
    setCroppedAreaPixels(null);
    setCropSelection(null);
  };

  const handleCancelCrop = () => {
    setCropSource(null);
    setCroppedAreaPixels(null);
    setCropSelection(null);
    if (originalImageFile && !newImage) {
      setOriginalImageFile(null);
      setOriginalImagePreview(event?.originalImageUrl || null);
    }
  };

  const handleRemoveMedia = async (mediaId: number) => {
    if (!event) return;
    setMediaError(null);
    try {
      const response = await fetch(`/api/events/${event.id}/media?mediaId=${mediaId}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Impossibile rimuovere l’allegato");
      setEvent(current => current ? { ...current, media: current.media.filter(media => media.id !== mediaId) } : current);
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "Impossibile rimuovere l’allegato");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;
    setSaving(true);
    setMediaError(null);
    try {
      const eventToSave = { ...event, date: toDisplayDateFormat(event.date), originalImageCrop };
      let response: Response;
      if (newImage) {
        const formData = new FormData();
        formData.append("eventData", JSON.stringify(eventToSave));
        formData.append("coverImage", newImage);
        if (originalImageFile) formData.append("originalImage", originalImageFile);
        response = await fetch(`/api/events/${event.id}`, {
          method: "PUT",
          body: formData,
        });
      } else {
        response = await fetch(`/api/events/${event.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(eventToSave),
        });
      }
      const eventPayload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(eventPayload.error || "Errore nel salvataggio dell'evento");
      const savedCropValues = [eventPayload.originalImageCropX, eventPayload.originalImageCropY, eventPayload.originalImageCropWidth, eventPayload.originalImageCropHeight];
      const savedCrop = savedCropValues.every(value => typeof value === "number" && Number.isFinite(value))
        ? { x: savedCropValues[0], y: savedCropValues[1], width: savedCropValues[2], height: savedCropValues[3] }
        : null;
      setEvent(current => current ? {
        ...current,
        imageUrl: eventPayload.imageUrl ?? current.imageUrl,
        originalImageUrl: eventPayload.originalImageUrl ?? current.originalImageUrl,
        originalImageCrop: savedCrop,
      } : current);
      setOriginalImagePreview(eventPayload.originalImageUrl || null);
      setOriginalImageCrop(savedCrop);
      setNewImage(null);
      setImagePreview(null);
      setOriginalImageFile(null);

      const failedMedia: File[] = [];
      for (const file of pendingMedia) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("kind", file.type === "application/pdf" ? "pdf" : "image");
        try {
          const uploadResponse = await fetch(`/api/events/${event.id}/media`, { method: "POST", body: formData });
          if (!uploadResponse.ok) failedMedia.push(file);
        } catch {
          failedMedia.push(file);
        }
      }
      setPendingMedia(failedMedia);
      if (failedMedia.length) {
        setMediaError(`${failedMedia.length} allegato/i non caricati. Riprova a salvare.`);
        await fetchEvent(event.id);
        return;
      }
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "CLEAR_CACHE" });
      }
      router.push(`/events/${generateUniqueSlug(event.title, event.id)}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Errore nel salvataggio dell'evento");
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublication = async () => {
    if (!event) return;
    setModerationBusy(true);
    setModerationMessage(null);
    try {
      const response = await fetch(`/api/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: !event.isPublished }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Impossibile aggiornare la pubblicazione");
      clearServiceWorkerCache();
      setEvent(current => current ? { ...current, isPublished: payload.isPublished } : current);
      setModerationMessage(payload.isPublished ? "Evento ripubblicato." : "Evento spostato in bozza.");
    } catch (error) {
      setModerationMessage(error instanceof Error ? error.message : "Impossibile aggiornare la pubblicazione");
    } finally {
      setModerationBusy(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!event || !window.confirm(`Eliminare definitivamente "${event.title}"? L’operazione non può essere annullata.`)) return;
    setModerationBusy(true);
    setModerationMessage(null);
    try {
      const response = await fetch(`/api/events/${event.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (payload.deleted) {
        clearServiceWorkerCache();
        if (!response.ok) {
          const failures = Array.isArray(payload.cleanupFailures) ? ` File non rimossi: ${payload.cleanupFailures.join(", ")}` : "";
          window.alert(`${payload.error || "Evento eliminato, ma pulizia incompleta."}${failures}`);
        } else {
          window.alert("Evento eliminato.");
        }
        router.push("/account");
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Impossibile eliminare l’evento");
      router.push("/account");
    } catch (error) {
      setModerationMessage(error instanceof Error ? error.message : "Impossibile eliminare l’evento");
      setModerationBusy(false);
    }
  };

  if (status === "loading" || loading) {
    return <LoadingAnimation message="Caricamento evento..." className="min-h-screen" />;
  }
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center text-xl text-red-500">
        Devi essere loggato per modificare un evento.
      </div>
    );
  }

  const sessionUser = session.user as any;
  const sessionUserId = parseInt((sessionUser?.id || "").toString(), 10);
  const sessionEmail = (sessionUser?.email || "").toLowerCase();
  const isAdmin =
    sessionUser?.role === "admin" ||
    sessionUser?.type === "admin" ||
    sessionEmail === "andreacazzola90@gmail.com";

  const canEdit =
    !!event &&
    (isAdmin ||
      (!Number.isNaN(sessionUserId) && event.createdById === sessionUserId));

  if (event && !canEdit) {
    return (
      <div className="min-h-screen flex items-center justify-center text-xl text-red-500">
        Non hai i permessi per modificare questo evento.
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-xl text-red-500">
        {error}
      </div>
    );
  }
  if (!event) {
    return null;
  }

  return (
    <div className="min-h-screen py-8 px-2 bg-light w-full flex flex-col items-center">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-md p-8 border border-gray-200">
        <PageHeading className="page-heading-compact" title="Modifica Evento" />
        {isAdmin && (
          <section className="mb-6 space-y-3 border-b border-black/10 pb-5" aria-label="Moderazione evento">
            <p className="mb-0 text-sm font-semibold text-gray-700">
              Stato: {event.isPublished ? "Pubblicato" : "Bozza"}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleTogglePublication}
                disabled={moderationBusy || saving}
                className="rounded-full border border-gray-300 px-4 py-2 text-sm font-bold text-gray-800 disabled:opacity-50"
              >
                {moderationBusy ? "Attendi..." : event.isPublished ? "Metti in bozza" : "Ripubblica"}
              </button>
              <button
                type="button"
                onClick={handleDeleteEvent}
                disabled={moderationBusy || saving}
                className="rounded-full border border-red-300 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-50"
              >
                Elimina
              </button>
            </div>
            {moderationMessage && <p className="mb-0 text-sm font-medium text-red-700" role="status">{moderationMessage}</p>}
          </section>
        )}
        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label className="block font-semibold mb-1">Titolo</label>
            <input
              type="text"
              name="title"
              value={event.title}
              onChange={handleChange}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 text-black"
              required
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">Descrizione</label>
            <textarea
              name="description"
              value={event.description}
              onChange={handleChange}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 text-black"
              rows={4}
              required
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-semibold mb-1 flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-blue-500" />
                <span className="sr-only">Data</span>
              </label>
              <input
                type="date"
                name="date"
                value={event.date}
                onChange={handleChange}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 text-black"
                required
                aria-label="Data"
              />
            </div>
            <div>
              <label className="font-semibold mb-1 flex items-center gap-2">
                <ClockIcon className="w-5 h-5 text-blue-500" />
                <span className="sr-only">Ora</span>
              </label>
              <input
                type="time"
                name="time"
                value={event.time}
                onChange={handleChange}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 text-black"
                required
                aria-label="Ora"
              />
            </div>
          </div>
          <div>
            <label className="font-semibold mb-1 flex items-center gap-2">
              <MapPinIcon className="w-5 h-5 text-blue-500" />
              <span className="sr-only">Luogo</span>
            </label>
            <input
              type="text"
              name="location"
              value={event.location}
              onChange={handleChange}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 text-black"
              required
              aria-label="Luogo"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Categoria</label>
              <input
                type="text"
                name="category"
                value={event.category}
                onChange={handleChange}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 text-black"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Prezzo</label>
              <input
                type="text"
                name="price"
                value={event.price}
                onChange={handleChange}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 text-black"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold mb-1">Organizzatore</label>
            <input
              type="text"
              name="organizer"
              value={event.organizer}
              onChange={handleChange}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 text-black"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">Testo Originale</label>
            <textarea
              name="rawText"
              value={event.rawText}
              onChange={handleChange}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 text-black"
              rows={2}
            />
          </div>
          <section className="space-y-3 border-t border-black/10 pt-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold mb-1">Copertina evento</h2>
                <p className="text-sm text-gray-500 mb-0">Anteprima 16:9 · JPEG, PNG o WebP · max 4 MiB</p>
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                ref={fileInputRef}
                onChange={handleImageChange}
                className="sr-only"
              />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="px-4 py-2 border border-gray-300 text-sm font-semibold text-black hover:border-black">
                Sostituisci
              </button>
            </div>
            {(imagePreview || event.imageUrl) ? (
              <div className="space-y-3">
                <button type="button" onClick={handleOpenCropper} className="block w-full overflow-hidden border border-gray-200 bg-gray-100" aria-label="Ritaglia la copertina">
                  <img src={imagePreview || event.imageUrl || ""} alt="Anteprima copertina evento" className="aspect-video w-full object-cover" />
                </button>
                <button type="button" onClick={handleOpenCropper} className="text-sm font-semibold text-red-700 underline underline-offset-4">
                  Ritaglia immagine
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()} className="flex aspect-video w-full items-center justify-center border border-dashed border-gray-400 bg-gray-50 text-sm font-semibold text-gray-600 hover:border-black">
                Aggiungi immagine di copertina
              </button>
            )}
          </section>

          <section className="space-y-4 border-t border-black/10 pt-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold mb-1">Immagini e documenti</h2>
                <p className="text-sm text-gray-500 mb-0">Fino a 10 allegati · immagini e PDF fino a 4 MiB ciascuno</p>
              </div>
              <input
                ref={mediaInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                multiple
                onChange={handleAddMedia}
                className="sr-only"
              />
              <button type="button" onClick={() => mediaInputRef.current?.click()} disabled={event.media.length + pendingMedia.length >= 10} className="px-4 py-2 border border-gray-300 text-sm font-semibold text-black hover:border-black disabled:opacity-50">
                Aggiungi immagini o PDF
              </button>
            </div>
            {(event.media.length > 0 || pendingMedia.length > 0) ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {event.media.map(media => (
                  <div key={`saved-${media.id}`} className="flex min-w-0 items-center gap-3 border border-gray-200 bg-white p-3">
                    {media.kind === "image" ? (
                      <img src={media.url} alt={media.fileName} className="h-16 w-20 shrink-0 object-cover" />
                    ) : (
                      <span className="flex h-16 w-20 shrink-0 items-center justify-center bg-red-50 text-sm font-bold text-red-700">PDF</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 truncate text-sm font-semibold text-black">{media.fileName}</p>
                      <p className="mb-0 text-xs text-gray-500">{(media.sizeBytes / (1024 * 1024)).toFixed(1)} MB</p>
                    </div>
                    <button type="button" onClick={() => handleRemoveMedia(media.id)} className="px-2 py-1 text-sm font-semibold text-red-700 underline" aria-label={`Rimuovi ${media.fileName}`}>
                      Rimuovi
                    </button>
                  </div>
                ))}
                {pendingMedia.map((file, index) => (
                  <div key={`pending-${file.name}-${index}`} className="flex min-w-0 items-center gap-3 border border-dashed border-gray-400 bg-gray-50 p-3">
                    {file.type === "application/pdf" ? (
                      <span className="flex h-16 w-20 shrink-0 items-center justify-center bg-red-50 text-sm font-bold text-red-700">PDF</span>
                    ) : (
                      <img src={pendingMediaPreviews[index] || ""} alt="Anteprima allegato" className="h-16 w-20 shrink-0 object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 truncate text-sm font-semibold text-black">{file.name}</p>
                      <p className="mb-0 text-xs text-gray-500">Da caricare · {(file.size / (1024 * 1024)).toFixed(1)} MB</p>
                    </div>
                    <button type="button" onClick={() => setPendingMedia(current => current.filter((_, itemIndex) => itemIndex !== index))} className="px-2 py-1 text-sm font-semibold text-red-700 underline" aria-label={`Rimuovi ${file.name}`}>
                      Rimuovi
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">Nessun allegato aggiunto.</p>
            )}
            {mediaError && <p className="text-sm font-medium text-red-700" role="alert">{mediaError}</p>}
          </section>
          <div className="flex gap-4 mt-6">
            <button
              type="submit"
              disabled={saving || moderationBusy}
              className="px-6 py-2 rounded-full font-bold shadow-button bg-linear-to-r from-primary via-accent to-secondary text-white transition-all disabled:opacity-60"
            >
              {saving ? "Salvataggio..." : "Salva"}
            </button>
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/events/${generateUniqueSlug(event.title, event.id)}`,
                )
              }
              className="px-6 py-2 rounded-full font-bold shadow-button bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all"
            >
              Annulla
            </button>
          </div>
        </form>
      </div>
      {cropSource && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="cover-crop-title">
          <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl space-y-4 overflow-y-auto bg-white p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="cover-crop-title" className="mb-1 text-xl font-bold text-black">Ritaglia copertina</h2>
              </div>
              <button type="button" onClick={handleCancelCrop} className="px-3 py-2 text-sm font-semibold text-gray-700 underline">Chiudi</button>
            </div>
            <EventImageCropper
              image={cropSource}
              initialCrop={originalImageFile && !newImage ? undefined : originalImageCrop ?? undefined}
              onCropComplete={(_, areaPixels, natural) => {
                setCroppedAreaPixels(areaPixels);
                setCropSelection({
                  x: areaPixels.x / natural.width,
                  y: areaPixels.y / natural.height,
                  width: areaPixels.width / natural.width,
                  height: areaPixels.height / natural.height,
                });
              }}
            />
            <div className="flex justify-end gap-3">
              <button type="button" onClick={handleCancelCrop} className="px-4 py-2 border border-gray-300 text-sm font-semibold text-gray-700">Annulla</button>
              <button type="button" onClick={handleApplyCrop} disabled={!croppedAreaPixels} className="px-4 py-2 bg-red-700 text-sm font-semibold text-white disabled:opacity-50">Applica ritaglio</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
