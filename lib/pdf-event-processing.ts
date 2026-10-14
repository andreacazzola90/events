import { PDFParse } from 'pdf-parse';
import Groq from 'groq-sdk';
import type { EventData } from '../app/types/event';
import { extractTextFromImage } from '../app/lib/ocr';
import { extractTextFromImageSimple } from '../app/lib/ocr-simple';
import { extractPdfTitleCandidates, isNonEventPdfTitle, summarizePdfPages } from './pdf-text';

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
  let titleCandidates: string[] = [];
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
    const pageTexts = textResult.pages.map(page => page.text || '');
    const summarizedText = summarizePdfPages(pageTexts, 3000);
    pdfTextSummarized = summarizedText.summarized || pageCount > MAX_PDF_PAGES;
    rawText = summarizedText.text;
    titleCandidates = extractPdfTitleCandidates(pageTexts).filter(title => !isNonEventPdfTitle(title));

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
      const summarizedOcrText = summarizePdfPages(recognizedPages, 3000);
      rawText = summarizedOcrText.text;
      titleCandidates = extractPdfTitleCandidates(recognizedPages).filter(title => !isNonEventPdfTitle(title));
      pdfTextSummarized = summarizedOcrText.summarized;
    }
  } finally {
    await parser.destroy();
  }

  if (rawText.length < 10) {
    throw new Error('Non è stato trovato testo leggibile nel PDF. Prova con un PDF con testo selezionabile o più nitido.');
  }

  const currentDate = new Date().toISOString().slice(0, 10);
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
        content: `Crea un evento distinto per ogni titolo proprio nel seguente indice. Non raggruppare attività diverse della stessa giornata. Copia il titolo nel campo t. Usa il contesto pagina per assegnare data, ora, luogo e organizzatore; se un dato non è chiaro usa non trovato. La data di riferimento è ${currentDate}.

      Restituisci solo JSON compatto: {"events":[{"t":"titolo","d":"data YYYY-MM-DD o non trovato","h":"ora HH:MM o non trovato","l":"luogo o non trovato","o":"organizzatore o non trovato","c":"categoria o non trovato","p":"prezzo o non trovato","x":"descrizione breve"}]}.

      TITOLI:
      ${titleCandidates.map((title, index) => `${index + 1}. ${title}`).join('\n')}

      CONTESTO DELLE PAGINE:
      ${rawText}`,
      },
    ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 5000,
    reasoning_effort: 'low',
  });

  const content = completion.choices[0]?.message?.content || '';
  const first = content.indexOf('{');
  const last = content.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error('L’AI non ha restituito un JSON valido per il PDF.');

  const parsed = JSON.parse(content.slice(first, last + 1)) as Record<string, unknown>;
  const eventList = Array.isArray(parsed.events) ? parsed.events : [parsed];
  const events = eventList.slice(0, 100).flatMap((item): EventData[] => {
    if (!item || typeof item !== 'object') return [];
    const event = item as Record<string, unknown>;
    const title = typeof (event.title ?? event.t) === 'string' ? String(event.title ?? event.t).trim().slice(0, 160) : '';
    if (!title || isNonEventPdfTitle(title)) return [];
    const textValue = (value: unknown, fallback: string, max = 500) =>
      typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;

    return [{
      title,
      description: textValue(event.description ?? event.x, 'non trovato', 5000),
      date: textValue(event.date ?? event.d, 'non trovato', 40),
      time: textValue(event.time ?? event.h, 'non trovato', 40),
      location: textValue(event.location ?? event.l, 'non trovato', 300),
      organizer: textValue(event.organizer ?? event.o, 'non trovato', 200),
      category: textValue(event.category ?? event.c, 'non trovato', 100),
      price: textValue(event.price ?? event.p, 'non definito, ma speriamo gratis', 100),
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