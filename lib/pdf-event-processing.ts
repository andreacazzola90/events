import { PDFParse } from 'pdf-parse';
import Groq from 'groq-sdk';
import type { EventData } from '../app/types/event';
import { extractTextFromImage } from '../app/lib/ocr';
import { extractTextFromImageSimple } from '../app/lib/ocr-simple';
import { buildEventExtractionHints } from './event-hints';
import { summarizePdfPages } from './pdf-text';

export const MAX_EVENT_PDF_BYTES = 10 * 1024 * 1024;
const MAX_PDF_PAGES = 50;

export interface ProcessedPdfEventDocument {
  events: EventData[];
  previewImageDataUrl: string;
  debug: { pdfPages: number; textLength: number; pdfTextSummarized: boolean };
}

export async function processPdfEventDocument(
  pdfBytes: Uint8Array,
  sourceUrl?: string,
): Promise<ProcessedPdfEventDocument> {
  if (!pdfBytes.byteLength || pdfBytes.byteLength > MAX_EVENT_PDF_BYTES) {
    throw new Error('Il PDF deve pesare meno di 10 MB.');
  }
  if (Buffer.from(pdfBytes.subarray(0, 5)).toString('ascii') !== '%PDF-') {
    throw new Error('Il file selezionato non è un PDF valido.');
  }
  if (!process.env.GROQ_API_SECRET_KEY) {
    throw new Error('API non configurata correttamente - GROQ_API_SECRET_KEY mancante');
  }

  const parser = new PDFParse({ data: pdfBytes, verbosity: 0 });
  let rawText = '';
  let pageCount = 0;
  let previewImageDataUrl = '';
  let pdfTextSummarized = false;

  try {
    const info = await parser.getInfo();
    pageCount = info.total;
    if (!pageCount) throw new Error('Il PDF non contiene pagine leggibili.');

    const [textResult, screenshotResult] = await Promise.all([
      parser.getText({ first: MAX_PDF_PAGES }),
      parser.getScreenshot({ first: 3, desiredWidth: 1600, imageDataUrl: false }),
    ]);
    const summarizedText = summarizePdfPages(textResult.pages.map(page => page.text || ''));
    pdfTextSummarized = summarizedText.summarized || pageCount > MAX_PDF_PAGES;
    rawText = summarizedText.text;

    const firstPageImage = screenshotResult.pages[0]?.data;
    if (!firstPageImage?.length) throw new Error('Impossibile creare l’anteprima del PDF.');
    previewImageDataUrl = `data:image/png;base64,${Buffer.from(firstPageImage).toString('base64')}`;

    if (rawText.length < 10) {
      const recognizedPages: string[] = [];
      for (const [index, page] of screenshotResult.pages.entries()) {
        if (!page.data?.length) continue;
        const imageBuffer = new ArrayBuffer(page.data.byteLength);
        new Uint8Array(imageBuffer).set(page.data);
        const image = new File([imageBuffer], `pdf-page-${index + 1}.png`, { type: 'image/png' });
        try {
          const text = await extractTextFromImageSimple(image);
          if (text.trim().length >= 10) {
            recognizedPages.push(text.trim());
            continue;
          }
        } catch {
          // Try the secondary OCR engine for this page.
        }
        try {
          const text = await extractTextFromImage(image);
          if (text.trim().length >= 10) recognizedPages.push(text.trim());
        } catch {
          // Other pages can still provide usable text.
        }
      }
      const summarizedOcrText = summarizePdfPages(recognizedPages);
      rawText = summarizedOcrText.text;
      pdfTextSummarized = summarizedOcrText.summarized;
    }
  } finally {
    await parser.destroy();
  }

  if (rawText.length < 10) {
    throw new Error('Non è stato trovato testo leggibile nel PDF. Prova con un PDF con testo selezionabile o più nitido.');
  }

  const currentDate = new Date().toISOString().slice(0, 10);
  const heuristicHints = buildEventExtractionHints(rawText);
  const groq = new Groq({ apiKey: process.env.GROQ_API_SECRET_KEY });
  const completion = await groq.chat.completions.create({
    model: 'openai/gpt-oss-20b',
    messages: [
      {
        role: 'system',
        content: 'Sei un assistente esperto nell’estrazione di eventi da programmi PDF. Non inventare informazioni. Restituisci sempre JSON valido con un array events.',
      },
      {
        role: 'user',
        content: `Estrai gli eventi da questo programma PDF. La data di riferimento è ${currentDate}.

REGOLE:
- Restituisci {"events":[...]} anche quando trovi un solo evento.
- Se il PDF descrive una rassegna o festival in date diverse, crea un evento distinto per ogni appuntamento.
- Più sessioni o attività con lo stesso titolo e la stessa data fanno parte dello stesso evento.
- Non inventare date, orari, prezzi, luoghi o organizzatori. Se non trovi un dato usa "non trovato".
- Date in formato YYYY-MM-DD; ora in formato HH:MM.
- Ogni evento deve avere title, description, date, time, location, organizer, category, price e rawText.
- Mantieni rawText vuoto: il testo sorgente verrà associato dal sistema.
- In description conserva i dettagli e i programmi utili dell’appuntamento.
- Limita gli eventi a 50 e restituisci solo JSON valido.

INDIZI:
${heuristicHints}

TESTO ESTRATTO DAL PDF:
${rawText}
`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 1500,
    reasoning_effort: 'low',
  });

  const content = completion.choices[0]?.message?.content || '';
  const first = content.indexOf('{');
  const last = content.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('L’AI non ha restituito un JSON valido per il PDF.');

  const parsed = JSON.parse(content.slice(first, last + 1)) as Record<string, unknown>;
  const eventList = Array.isArray(parsed.events) ? parsed.events : [parsed];
  const events = eventList.slice(0, 50).flatMap((item): EventData[] => {
    if (!item || typeof item !== 'object') return [];
    const event = item as Record<string, unknown>;
    const title = typeof event.title === 'string' ? event.title.trim().slice(0, 160) : '';
    if (!title) return [];
    const textValue = (value: unknown, fallback: string, max = 500) =>
      typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;

    return [{
      title,
      description: textValue(event.description, 'non trovato', 5000),
      date: textValue(event.date, 'non trovato', 40),
      time: textValue(event.time, 'non trovato', 40),
      location: textValue(event.location, 'non trovato', 300),
      organizer: textValue(event.organizer, 'non trovato', 200),
      category: textValue(event.category, 'non trovato', 100),
      price: textValue(event.price, 'non definito, ma speriamo gratis', 100),
      rawText,
      sourceUrl,
    }];
  });

  if (!events.length) throw new Error('Nessun evento trovato nel PDF.');

  return {
    events,
    previewImageDataUrl,
    debug: { pdfPages: pageCount, textLength: rawText.length, pdfTextSummarized },
  };
}