import { PDFParse } from 'pdf-parse';
import Groq from 'groq-sdk';
import type { EventData } from '../app/types/event';
import { extractTextFromImage } from '../app/lib/ocr';
import { extractTextFromImageSimple } from '../app/lib/ocr-simple';
import { scanPdfEventPages } from './event-scan-pipeline';
import { MAX_EVENT_PDF_BYTES } from './pdf-download';

export { MAX_EVENT_PDF_BYTES } from './pdf-download';
const MAX_PDF_PAGES = 50;

export interface ProcessedPdfEventDocument {
  events: EventData[];
  previewImageDataUrl: string;
  debug: {
    pdfPages: number;
    textLength: number;
    pdfTextSummarized: boolean;
    scanStatus: 'completed' | 'partial' | 'failed';
    scanCounts: { candidates: number; completed: number; failed: number; pending: number };
    unscannedPages: number;
  };
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
  let pageTexts: string[] = [];
  let pageCount = 0;
  let previewImageDataUrl = '';

  try {
    const info = await parser.getInfo();
    pageCount = info.total;
    if (!pageCount) throw new Error('Il PDF non contiene pagine leggibili.');

    const [textResult, screenshotResult] = await Promise.all([
      parser.getText({ first: MAX_PDF_PAGES }),
      parser.getScreenshot({ first: 3, desiredWidth: 1600, imageDataUrl: false }),
    ]);
    pageTexts = textResult.pages.map(page => page.text || '');

    const firstPageImage = screenshotResult.pages[0]?.data;
    if (!firstPageImage?.length) throw new Error('Impossibile creare l’anteprima del PDF.');
    previewImageDataUrl = `data:image/png;base64,${Buffer.from(firstPageImage).toString('base64')}`;

    if (pageTexts.join('\n').trim().length < 10) {
      const recognizedPages = Array.from({ length: screenshotResult.pages.length }, () => '');
      for (const [index, page] of screenshotResult.pages.entries()) {
        if (!page.data?.length) continue;
        const imageBuffer = new ArrayBuffer(page.data.byteLength);
        new Uint8Array(imageBuffer).set(page.data);
        const image = new File([imageBuffer], `pdf-page-${index + 1}.png`, { type: 'image/png' });
        try {
          const text = await extractTextFromImageSimple(image);
          if (text.trim().length >= 10) {
            recognizedPages[index] = text.trim();
            continue;
          }
        } catch {
          // Try the secondary OCR engine for this page.
        }
        try {
          const text = await extractTextFromImage(image);
          if (text.trim().length >= 10) recognizedPages[index] = text.trim();
        } catch {
          // Other pages can still provide usable text.
        }
      }
      pageTexts = recognizedPages;
    }
  } finally {
    await parser.destroy();
  }

  if (pageTexts.join('\n').trim().length < 10) {
    throw new Error('Non è stato trovato testo leggibile nel PDF. Prova con un PDF con testo selezionabile o più nitido.');
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_SECRET_KEY });
  const scan = await scanPdfEventPages(pageTexts, async (messages, signal) => {
    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 4000,
      reasoning_effort: 'low',
    }, { signal, timeout: 12_000, maxRetries: 0 });
    if (completion.choices[0]?.finish_reason !== 'stop') throw new Error('Incomplete PDF detail response');
    return completion.choices[0]?.message?.content || '';
  }, { budgetMs: 30_000 });

  const totalTextLength = pageTexts.reduce((total, page) => total + page.length, 0);
  const unscannedPages = Math.max(0, pageCount - pageTexts.length);
  const scanStatus = unscannedPages > 0 && scan.status === 'completed' ? 'partial' : scan.status;
  const pdfTextSummarized = totalTextLength > 3_000 || unscannedPages > 0 || scan.counts.pending > 0;

  return {
    events: scan.events.map(event => ({ ...event, sourceUrl })),
    previewImageDataUrl,
    debug: {
      pdfPages: pageCount,
      textLength: totalTextLength,
      pdfTextSummarized,
      scanStatus,
      scanCounts: scan.counts,
      unscannedPages,
    },
  };
}