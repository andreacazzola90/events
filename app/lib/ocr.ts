
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
  } catch (ocrSpaceError) {
    console.log('⚠️ OCR.space failed, trying Tesseract.js fallback...');
    
    try {
      // Fallback to Tesseract.js with serverless configuration
      const worker = await createWorker('ita');
      const { data: { text } } = await worker.recognize(imageFile);
      await worker.terminate();
      console.log('✅ Tesseract.js OCR successful');
      return text;
    } catch (tesseractError) {
      console.error('❌ Both OCR methods failed:', {
        ocrSpace: ocrSpaceError instanceof Error ? ocrSpaceError.message : ocrSpaceError,
        tesseract: tesseractError instanceof Error ? tesseractError.message : tesseractError
      });
      
      // Final fallback - return error message with helpful info
      throw new Error(`OCR processing failed. Both OCR.space and Tesseract.js are unavailable. Original errors: OCR.space: ${ocrSpaceError instanceof Error ? ocrSpaceError.message : 'Unknown error'}, Tesseract: ${tesseractError instanceof Error ? tesseractError.message : 'Unknown error'}`);
    }
  }
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
  try {
    const worker = await tesseractCreateWorker({
      // Configure paths for serverless environment
      workerPath: 'https://unpkg.com/tesseract.js@5.0.3/dist/worker.min.js',
      langPath: 'https://tessdata.projectnaptha.com/4.0.0',
      corePath: 'https://unpkg.com/tesseract.js-core@5.0.0/tesseract-core-simd.wasm.js',
    });
    
    await worker.load();
    await worker.loadLanguage(language);
    await worker.initialize(language);
    return worker;
  } catch (error) {
    console.error('❌ Tesseract.js worker creation failed:', error);
    throw new Error('OCR fallback failed: Unable to initialize Tesseract.js worker');
  }
}

