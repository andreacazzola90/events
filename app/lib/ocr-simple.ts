import axios from 'axios';
import { EventData, OCRResponse } from '@/types/event';

/**
 * Simplified OCR function that relies primarily on OCR.space API
 * with better error handling for serverless environments
 */
export async function extractTextFromImageSimple(imageFile: File): Promise<string> {
  console.log('🔍 Starting OCR text extraction...');
  
  try {
    // Convert File to base64 for API
    const base64 = await fileToBase64(imageFile);
    
    // Try OCR.space API with base64
    const formData = new FormData();
    formData.append('base64Image', `data:${imageFile.type};base64,${base64}`);
    formData.append('apikey', 'K83907440988957');
    formData.append('language', 'ita');
    formData.append('isOverlayRequired', 'false');
    formData.append('detectOrientation', 'true');
    formData.append('scale', 'true');
    formData.append('OCREngine', '2'); // Use engine 2 for better results
    
    console.log('📡 Calling OCR.space API...');
    
    const response = await axios.post<OCRResponse>(
      'https://api.ocr.space/parse/image',
      formData,
      {
        headers: {
          'apikey': 'K83907440988957',
        },
        timeout: 30000, // 30 second timeout
      }
    );

    console.log('📊 OCR.space response:', {
      isErrored: response.data.IsErroredOnProcessing,
      hasResults: !!response.data.ParsedResults?.[0],
    });

    if (response.data.IsErroredOnProcessing) {
      throw new Error(`OCR.space processing error: ${response.data.ErrorMessage || 'Unknown error'}`);
    }

    if (!response.data.ParsedResults?.[0]?.ParsedText) {
      throw new Error('OCR.space returned no text results');
    }

    const extractedText = response.data.ParsedResults[0].ParsedText.trim();
    
    if (extractedText.length < 10) {
      console.warn('⚠️ OCR extracted very little text:', extractedText);
    }
    
    console.log('✅ OCR text extraction successful');
    return extractedText;
    
  } catch (error) {
    console.error('❌ OCR extraction failed:', error);
    
    // Return a more user-friendly error
    if (error instanceof Error) {
      throw new Error(`Impossibile estrarre testo dall'immagine: ${error.message}. Assicurati che l'immagine contenga testo leggibile.`);
    }
    
    throw new Error('Impossibile estrarre testo dall\'immagine. Riprova con un\'immagine più chiara.');
  }
}

/**
 * Convert File to base64 string
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data:image/...;base64, prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Enhanced event parsing with better pattern recognition
 */
export function parseEventDataEnhanced(rawText: string): EventData {
  console.log('📝 Parsing event data from text...');
  
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

  // Enhanced title extraction - first significant line
  eventData.title = lines.find(line => 
    line.length > 5 && 
    !line.match(/^\d+/) && // Not starting with numbers
    !line.toLowerCase().includes('evento') &&
    !line.toLowerCase().includes('event')
  ) || lines[0] || '';

  // Enhanced date extraction
  for (const line of lines) {
    const dateMatch = line.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if (dateMatch) {
      const [, day, month, year] = dateMatch;
      const fullYear = year.length === 2 ? `20${year}` : year;
      eventData.date = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      break;
    }
  }

  // Enhanced time extraction
  for (const line of lines) {
    const timeMatch = line.match(/(\d{1,2})[:\.](\d{2})/);
    if (timeMatch) {
      const [, hours, minutes] = timeMatch;
      eventData.time = `${hours.padStart(2, '0')}:${minutes}`;
      break;
    }
  }

  // Enhanced location extraction
  const locationKeywords = ['via', 'piazza', 'corso', 'viale', 'largo', 'presso', 'location', 'venue', 'indirizzo'];
  for (const line of lines) {
    if (locationKeywords.some(keyword => line.toLowerCase().includes(keyword))) {
      eventData.location = line;
      break;
    }
  }

  // Enhanced price extraction
  for (const line of lines) {
    if (line.match(/€|euro|gratis|free|prezzo/i)) {
      eventData.price = line;
      break;
    }
  }

  // Combine remaining lines as description
  const usedLines = [eventData.title, eventData.location, eventData.price].filter(Boolean);
  eventData.description = lines
    .filter(line => !usedLines.includes(line))
    .join(' ')
    .slice(0, 500); // Limit description length

  console.log('✅ Event data parsing completed');
  return eventData;
}