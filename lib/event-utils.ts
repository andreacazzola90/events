import { STANDARD_CATEGORIES, CATEGORY_MAPPING, PRICE_NORMALIZATION_MAP } from './constants';

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
