import { STANDARD_CATEGORIES, CATEGORY_MAPPING, PRICE_NORMALIZATION_MAP } from './constants';
import type { EventData } from '../app/types/event';

/**
 * Normalizza la categoria dell'evento.
 * Se la categoria è mappata, usa il valore mappato.
 * Se la categoria è già standard, la restituisce.
 * Altrimenti cerca una corrispondenza parziale o restituisce 'altro'.
 */
export function normalizeCategory(category: string): string {
    const lowerCat = (category || '').toLowerCase().trim();
    
    if (!lowerCat) return 'altro';

    // Check mapping
    if (CATEGORY_MAPPING[lowerCat]) {
        return CATEGORY_MAPPING[lowerCat];
    }

    // Check if already standard
    if (STANDARD_CATEGORIES.includes(lowerCat)) {
        return lowerCat;
    }

    // Fuzzy match (simple)
    for (const standard of STANDARD_CATEGORIES) {
        if (lowerCat.includes(standard) || standard.includes(lowerCat)) {
            return standard;
        }
    }

    return lowerCat; // Allow custom categories but normalized
}

/**
 * Normalizza il prezzo dell'evento.
 * Mappa termini come "gratis" o "ingresso libero" a "Gratuito".
 */
export function normalizePrice(price: string): string {
    const lowerPrice = (price || '').toLowerCase().trim();
    
    if (!lowerPrice) return 'Gratuito';

    for (const [key, value] of Object.entries(PRICE_NORMALIZATION_MAP)) {
        if (lowerPrice.includes(key)) {
            return value;
        }
    }

    return price; // Return original if no match (e.g., "10€")
}

/**
 * Raggruppa eventi per data.
 * - Se ci sono più "incontri" nello stesso giorno, li unisce in UN SOLO evento
 *   combinando orari e descrizioni.
 * - Se ci sono più giorni diversi, ogni giorno rimane un evento separato.
 */
export function groupEventsByDate(events: EventData[]): EventData[] {
    if (!Array.isArray(events) || events.length === 0) return events;

    const byDate = new Map<string, EventData[]>();

    for (const ev of events) {
        const key = (ev.date || '').trim();
        if (!byDate.has(key)) byDate.set(key, []);
        byDate.get(key)!.push(ev);
    }

    const result: EventData[] = [];

    for (const [date, list] of byDate.entries()) {
        if (!date || list.length === 0) {
            // Se non abbiamo una data affidabile, non proviamo a raggruppare
            result.push(...list);
            continue;
        }

        if (list.length === 1) {
            // Un solo evento in quel giorno: lascialo così com'è
            result.push(list[0]);
            continue;
        }

        // Più "incontri" nello stesso giorno: uniscili in un unico evento
        const base = { ...list[0] } as EventData;

        // Combina orari distinti in una singola stringa (es: "18:00 / 21:00")
        const times = Array.from(
            new Set(
                list
                    .map(e => (e.time || '').trim())
                    .filter(Boolean)
            )
        );
        if (times.length > 0) {
            base.time = times.join(' / ');
        }

        // Combina le descrizioni, preservando le info di ogni slot
        const parts: string[] = [];
        for (const ev of list) {
            const timeLabel = (ev.time || '').trim();
            const titleLabel = (ev.title || base.title || '').trim();
            const description = (ev.description || '').trim();

            if (!description) continue;

            if (timeLabel) {
                parts.push(`• ${timeLabel} - ${titleLabel}: ${description}`);
            } else {
                parts.push(`• ${titleLabel}: ${description}`);
            }
        }

        if (parts.length > 0) {
            // Mantieni eventualmente una descrizione iniziale e aggiungi i dettagli per slot
            const header = (base.description || '').trim();
            base.description = header
                ? `${header}\n\n${parts.join('\n')}`
                : parts.join('\n');
        }

        result.push(base);
    }

    return result;
}
