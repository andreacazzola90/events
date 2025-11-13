"use client";

import { useState, useEffect, useRef } from "react";
import { CalendarIcon, ClockIcon, MapPinIcon } from "../../../components/EventIcons";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { extractIdFromSlug, generateUniqueSlug } from "../../../../lib/slug-utils";

interface Event {
    id: number;
    title: string;
    description: string;
    date: string;
    time: string;
    location: string;
    organizer: string;
    category: string;
    price: string;
    rawText: string;
    imageUrl: string | null;
}

export default function EditEventPage() {
    const params = useParams();
    const router = useRouter();
    const { data: session, status } = useSession();
    const [event, setEvent] = useState<Event | null>(null);
    // Helper to convert DD/MM/YYYY to YYYY-MM-DD for input type=date
    function toInputDateFormat(date: string) {
        if (!date) return '';
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
        if (!date) return '';
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
    const [newImage, setNewImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (params && params.slug) {
            const eventId = extractIdFromSlug(params.slug as string);
            if (eventId) {
                fetchEvent(eventId);
            } else {
                setError('Invalid event URL');
                setLoading(false);
            }
        }
    }, [params?.slug]);

    const fetchEvent = async (eventId: number) => {
        try {
            const response = await fetch(`/api/events/${eventId}`);
            if (response.ok) {
                const data = await response.json();
                // Convert date to input format if needed
                data.date = toInputDateFormat(data.date);
                setEvent(data);
            } else {
                setError("Evento non trovato");
            }
        } catch (error) {
            setError("Errore nel caricamento dell'evento");
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (!event) return;
        let value = e.target.value;
        // If changing date, keep in YYYY-MM-DD for input, but convert to DD/MM/YYYY on save
        if (e.target.name === 'date') {
            value = value; // keep as is for input
        }
        setEvent({ ...event, [e.target.name]: value });
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setNewImage(e.target.files[0]);
            setImagePreview(URL.createObjectURL(e.target.files[0]));
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!event) return;
        setSaving(true);
        try {
            let imageUrl = event.imageUrl;
            // Se c'è una nuova immagine, carica con FormData
            if (newImage) {
                const formData = new FormData();
                const eventToSave = {
                    ...event,
                    date: toDisplayDateFormat(event.date),
                };
                formData.append('eventData', JSON.stringify(eventToSave));
                formData.append('image', newImage);
                const response = await fetch(`/api/events/${event.id}`, {
                    method: "PUT",
                    body: formData,
                });
                if (response.ok) {
                    router.push(`/events/${generateUniqueSlug(event.title, event.id)}`);
                } else {
                    setError("Errore nel salvataggio dell'evento");
                }
            } else {
                // Altrimenti salva come JSON
                const eventToSave = {
                    ...event,
                    date: toDisplayDateFormat(event.date),
                };
                const response = await fetch(`/api/events/${event.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(eventToSave),
                });
                if (response.ok) {
                    router.push(`/events/${generateUniqueSlug(event.title, event.id)}`);
                } else {
                    setError("Errore nel salvataggio dell'evento");
                }
            }
        } catch (error) {
            setError("Errore nel salvataggio dell'evento");
        } finally {
            setSaving(false);
        }
    };

    if (status === "loading" || loading) {
        return <div className="min-h-screen flex items-center justify-center text-2xl">Caricamento...</div>;
    }
    if (!session) {
        return <div className="min-h-screen flex items-center justify-center text-xl text-red-500">Devi essere loggato per modificare un evento.</div>;
    }
    if (error) {
        return <div className="min-h-screen flex items-center justify-center text-xl text-red-500">{error}</div>;
    }
    if (!event) {
        return null;
    }

    return (
        <div className="min-h-screen py-8 px-2 bg-light w-full flex flex-col items-center">
            <div className="w-full max-w-2xl bg-white rounded-xl shadow-md p-8 border border-gray-200">
                <h1 className="text-3xl font-bold mb-6">Modifica Evento</h1>
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
                    <div>
                        <label className="block font-semibold mb-1">Immagine Evento</label>
                        <div className="flex items-center gap-4">
                            {(imagePreview || event.imageUrl) && (
                                <img
                                    src={imagePreview || event.imageUrl || ''}
                                    alt="Anteprima immagine"
                                    className="w-32 h-32 object-cover rounded border"
                                />
                            )}
                            <input
                                type="file"
                                accept="image/*"
                                ref={fileInputRef}
                                onChange={handleImageChange}
                                className="block mt-2 text-black"
                            />
                        </div>
                    </div>
                    <div className="flex gap-4 mt-6">
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-6 py-2 rounded-full font-bold shadow-button bg-linear-to-r from-primary via-accent to-secondary text-white transition-all disabled:opacity-60"
                        >
                            {saving ? "Salvataggio..." : "Salva"}
                        </button>
                        <button
                            type="button"
                            onClick={() => router.push(`/events/${generateUniqueSlug(event.title, event.id)}`)}
                            className="px-6 py-2 rounded-full font-bold shadow-button bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all"
                        >
                            Annulla
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
