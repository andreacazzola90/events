import { EventData } from '../types/event';
import Tesseract from 'tesseract.js';
import { parseMultipleEvents } from './eventParsing';

// Regex per date italiane
const DATE_REGEX = /(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})|(\d{1,2}\s+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)[a-z]*\.?\s+\d{2,4})/i;
const TIME_REGEX = /(ore\s+\d{1,2}([:.]\d{2})?)|(\b\d{1,2}[:.]\d{2}\b)/i;

// Mappa parole chiave -> categoria
const CATEGORY_KEYWORDS: Record<string, string> = {
  musica: 'Musica', concerto: 'Musica', dj: 'Musica', band: 'Musica', live: 'Musica',
  calcio: 'Sport', tennis: 'Sport', basket: 'Sport', gara: 'Sport', torneo: 'Sport', corsa: 'Sport',
  mostra: 'Cultura', conferenza: 'Cultura', libro: 'Cultura', presentazione: 'Cultura', arte: 'Cultura',
  teatro: 'Teatro', cabaret: 'Teatro', spettacolo: 'Teatro', commedia: 'Teatro',
  cinema: 'Cinema', film: 'Cinema', proiezione: 'Cinema',
  degustazione: 'Food & Drink', cena: 'Food & Drink', birra: 'Food & Drink', vino: 'Food & Drink', food: 'Food & Drink',
  festa: 'Feste', party: 'Feste', celebration: 'Feste',
  bambini: 'Bambini', family: 'Bambini', famiglie: 'Bambini',
  workshop: 'Workshop', corso: 'Workshop', laboratorio: 'Workshop', seminario: 'Workshop'
};

/**
 * Estrazione testo semplificata senza uso esplicito di worker-script interno.
 * Usa l'API statica Tesseract.recognize che gestisce internamente worker + fallback.
 * Nota: performance inferiore rispetto al worker manuale, ma evita errori MODULE_NOT_FOUND.
 */
export async function extractTextWithTesseract(imageFile: File): Promise<string> {
  // Convert File (web API) to Buffer for Node runtime if necessario
  let input: string | Buffer | any = imageFile as any;
  if (typeof (imageFile as any).arrayBuffer === 'function') {
    const bytes = await imageFile.arrayBuffer();
    input = Buffer.from(bytes);
  }
  try {
    const result = await Tesseract.recognize(input, 'ita', {
      // Riduci log
      logger: () => { /* silence */ }
    });
    return result.data.text;
  } catch (err) {
    console.error('Errore Tesseract (modalità free):', err);
    // Ritorna stringa vuota per permettere parsing robusto
    return '';
  }
}

export async function analyzeEventImageFree(imageFile: File): Promise<EventData[]> {
  const rawText = await extractTextWithTesseract(imageFile);
  return parseMultipleEvents(rawText);
}
