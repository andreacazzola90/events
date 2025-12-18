import sharp from 'sharp';
import axios from 'axios';
import { createWorker } from 'tesseract.js';
import { EventData, OCRResponse } from '@/types/event';

export async function extractTextFromImage(imageFile: File): Promise<string> {
  let processedBuffer: Buffer | null = null;
  
  try {
    // Pre-process image with sharp to improve OCR quality
    const arrayBuffer = await imageFile.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);
    
    processedBuffer = await sharp(inputBuffer)
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: false }) // Upscale if small
      .grayscale() // Better for OCR
      .normalize() // Improve contrast
      .sharpen() // Sharpen edges
      .toBuffer();

    // Try OCR.space API first with processed image
    const formData = new FormData();
    // In Node.js, we can append the buffer directly or as a Blob
    const blob = new Blob([processedBuffer as any], { type: 'image/jpeg' });
    formData.append('file', blob, 'processed.jpg');
    formData.append('apikey', 'K83907440988957');
    formData.append('language', 'ita');
    formData.append('isOverlayRequired', 'false');
    formData.append('detectOrientation', 'true');
    formData.append('scale', 'true');
    formData.append('OCREngine', '2');
    
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
      const errorMsg = response.data.ErrorMessage ? response.data.ErrorMessage[0] : 'Nessun testo rilevato';
      console.warn(`⚠️ OCR.space failed: ${errorMsg}`);
      // Throw to trigger Tesseract fallback
      throw new Error(`OCR.space failed: ${errorMsg}`);
    }

    return response.data.ParsedResults[0].ParsedText;
  } catch (ocrSpaceError) {
    console.log('⚠️ OCR.space failed, trying Tesseract.js fallback...');
    
    try {
      // Fallback to Tesseract.js with latest API (v5+)
      // Using createWorker is more robust as it allows better initialization
      const worker = await createWorker('ita', 1, {
        logger: m => console.log(m.status, m.progress ? `(${Math.round(m.progress * 100)}%)` : ''),
      });
      
      const { data: { text } } = await worker.recognize(processedBuffer || imageFile);
      await worker.terminate();
      
      if (!text || text.trim().length === 0) {
        console.log('ℹ️ Tesseract returned no text, continuing...');
        return '';
      }

      console.log('✅ Tesseract.js OCR successful');
      return text;
    } catch (tesseractError) {
      console.error('❌ Both OCR methods failed:', {
        ocrSpace: ocrSpaceError instanceof Error ? ocrSpaceError.message : ocrSpaceError,
        tesseract: tesseractError instanceof Error ? tesseractError.message : tesseractError
      });
      
      // Return empty string instead of throwing to allow the process to continue
      console.log('⚠️ OCR failed but continuing with available data...');
      return '';
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

