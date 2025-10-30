
import axios from 'axios';
import { EventData, OCRResponse } from '@/types/event';
import { createWorker as tesseractCreateWorker } from 'tesseract.js';


export async function extractTextFromImage(imageFile: File): Promise<string> {
  try {
    // Try OCR.space API first
    const formData = new FormData();
    formData.append('file', imageFile);
    formData.append('apikey', 'helloworld'); // Free API key for testing
    formData.append('language', 'ita');
    
    const response = await axios.post<OCRResponse>(
      'https://api.ocr.space/parse/image',
      formData,
      {
        headers: {
          'apikey': 'K83907440988957',
        },
      }
    );

    if (response.data.IsErroredOnProcessing || !response.data.ParsedResults?.[0]?.ParsedText) {
      throw new Error('OCR.space processing failed');
    }

    return response.data.ParsedResults[0].ParsedText;
  } catch (error) {
    // Fallback to Tesseract.js
    const worker = await createWorker('ita');
    const { data: { text } } = await worker.recognize(imageFile);
    await worker.terminate();
    return text;
  }
}

/**
 * Analizza il testo grezzo ed estrae uno o più eventi
 */
export function parseMultipleEvents(rawText: string): EventData[] {
  const lines = rawText.split('\n').map(line => line.trim()).filter(Boolean);
  
  // Cerca separatori di eventi o pattern che indicano multipli eventi
  const eventBoundaries = findEventBoundaries(lines);
  
  if (eventBoundaries.length <= 1) {
    // Un solo evento trovato
    return [parseEventData(rawText)];
  }
  
  // Multipli eventi trovati - dividi il testo e parsa ciascun evento
  const events: EventData[] = [];
  for (let i = 0; i < eventBoundaries.length; i++) {
    const start = eventBoundaries[i];
    const end = i < eventBoundaries.length - 1 ? eventBoundaries[i + 1] : lines.length;
    const eventLines = lines.slice(start, end);
    const eventText = eventLines.join('\n');
    
    if (eventText.trim()) {
      events.push(parseEventData(eventText));
    }
  }
  
  return events.filter(event => event.title); // Filtra eventi vuoti
}

/**
 * Trova i confini tra multipli eventi nel testo
 */
function findEventBoundaries(lines: string[]): number[] {
  const boundaries: number[] = [0]; // Il primo evento inizia sempre a 0
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const prevLine = lines[i - 1];
    
    // Pattern che indicano l'inizio di un nuovo evento:
    // 1. Una data seguita da un possibile titolo in maiuscolo
    // 2. Separatori visivi (----, ===, etc.)
    // 3. Keywords come "Evento:", "Event:", etc.
    // 4. Due date consecutive (suggerisce due eventi diversi)
    
    const hasDate = /\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/.test(line) || 
                    /\d{1,2}\s+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)[a-z]*\.?\s+\d{2,4}/i.test(line);
    const prevHasDate = /\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/.test(prevLine) || 
                        /\d{1,2}\s+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)[a-z]*\.?\s+\d{2,4}/i.test(prevLine);
    
    const isSeparator = /^[\-=_]{3,}$/.test(line);
    const isEventKeyword = /^(evento|event|events|eventi)[:]/i.test(line);
    const isUppercaseTitle = line.length > 5 && line === line.toUpperCase() && !/\d/.test(line);
    
    // Se troviamo due date separate da meno di 3 righe, probabilmente sono due eventi diversi
    if (hasDate && prevHasDate && i - boundaries[boundaries.length - 1] > 2) {
      boundaries.push(i);
    }
    // Separatori visivi
    else if (isSeparator && i - boundaries[boundaries.length - 1] > 2) {
      boundaries.push(i + 1); // Il prossimo evento inizia dopo il separatore
    }
    // Keywords o titoli in maiuscolo (se abbastanza distanti dall'ultimo confine)
    else if ((isEventKeyword || isUppercaseTitle) && i - boundaries[boundaries.length - 1] > 5) {
      boundaries.push(i);
    }
  }
  
  return boundaries;
}

export function parseEventData(rawText: string): EventData {
  const lines = rawText.split('\n').map(line => line.trim()).filter(Boolean);
  let eventData: EventData = {
    title: '',
    description: '',
    date: '',
    time: '',
    location: '',
    rawText,
    organizer: '',
    category: '',
    price: '',
    imageUrl: undefined
  };

  // Title is usually the first non-empty line
  eventData.title = lines[0] || '';
  const usedIndexes = new Set<number>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    // Date
    if (line.match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/) || 
        line.match(/\d{1,2}\s+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)[a-z]*\.?\s+\d{2,4}/i)) {
      eventData.date = lines[i];
      usedIndexes.add(i);
      continue;
    }
    // Time
    if (line.match(/\d{1,2}[:\.]\d{2}/) || line.match(/ore\s+\d{1,2}([:.]\d{2})?/i)) {
      eventData.time = lines[i];
      usedIndexes.add(i);
      continue;
    }
    // Location
    if (line.includes('presso') || line.includes('location') || line.includes('indirizzo') ||
        line.includes('via') || line.includes('piazza')) {
      eventData.location = lines[i];
      usedIndexes.add(i);
      continue;
    }
  }
  // Descrizione: tutte le linee non usate come campo specifico
  eventData.description = lines
    .filter((_, idx) => idx !== 0 && !usedIndexes.has(idx))
    .join(' ');
  return eventData;
}

async function createWorker(language: string) {
  const worker = await tesseractCreateWorker();
  await worker.load();
  await worker.loadLanguage(language);
  await worker.initialize(language);
  return worker;
}

