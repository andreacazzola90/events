import { EventData } from '@/types/event';
import sharp from 'sharp';

/**
 * Compress image if it exceeds the size limit
 * Target: under 1MB for OCR.space API
 */
async function compressImage(file: File, maxSizeKB: number = 900): Promise<File> {
  const fileSizeKB = file.size / 1024;
  console.log(`📏 Image size: ${fileSizeKB.toFixed(2)} KB`);
  
  // If file is already small enough, return as is
  if (fileSizeKB <= maxSizeKB) {
    console.log('✅ Image size OK, no compression needed');
    return file;
  }
  
  console.log(`🗜️ Compressing image from ${fileSizeKB.toFixed(2)} KB to ~${maxSizeKB} KB...`);
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Calculate new dimensions to reduce file size
        // Reduce dimensions progressively based on how much we need to compress
        const compressionRatio = Math.sqrt(maxSizeKB / fileSizeKB);
        width = Math.floor(width * compressionRatio);
        height = Math.floor(height * compressionRatio);
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        // Draw image with high quality
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to blob with quality adjustment
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }
            
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            
            const newSizeKB = compressedFile.size / 1024;
            console.log(`✅ Compressed to ${newSizeKB.toFixed(2)} KB (${width}x${height})`);
            resolve(compressedFile);
          },
          'image/jpeg',
          0.85 // Quality: 85%
        );
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Core OCR function that calls OCR.space API directly
 * Can be used both server-side and client-side
 */
async function performOCR(imageFile: File): Promise<string> {
  console.log('📡 Calling OCR.space API directly...');

  const arrayBuffer = await imageFile.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);
  const candidates: Buffer[] = [];

  try {
    const normalized = await sharp(inputBuffer)
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: false })
      .grayscale()
      .normalize()
      .sharpen()
      .toBuffer();
    candidates.push(normalized);

    const highContrast = await sharp(inputBuffer)
      .resize(2200, 2200, { fit: 'inside', withoutEnlargement: false })
      .grayscale()
      .normalize()
      .threshold(170)
      .sharpen()
      .toBuffer();
    candidates.push(highContrast);

    const slightUpscale = await sharp(inputBuffer)
      .resize(2600, 2600, { fit: 'inside', withoutEnlargement: false })
      .grayscale()
      .normalize()
      .modulate({ brightness: 1.05, saturation: 0 })
      .sharpen()
      .toBuffer();
    candidates.push(slightUpscale);

    console.log('✅ Image pre-processed with sharp');
  } catch (sharpError) {
    console.warn('⚠️ Sharp pre-processing failed, using original:', sharpError);
    candidates.push(inputBuffer);
  }

  let bestText = '';
  const languages = ['ita', 'eng'];

  for (const language of languages) {
    for (const [index, processedBuffer] of candidates.entries()) {
      const ocrFormData = new FormData();
      const blob = new Blob([processedBuffer as any], { type: 'image/jpeg' });
      ocrFormData.append('file', blob, 'image.jpg');
      ocrFormData.append('apikey', 'K83907440988957');
      ocrFormData.append('language', language);
      ocrFormData.append('isOverlayRequired', 'false');
      ocrFormData.append('detectOrientation', 'true');
      ocrFormData.append('scale', 'true');
      ocrFormData.append('OCREngine', '2');

      const response = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        headers: {
          'apikey': 'K83907440988957',
        },
        body: ocrFormData,
      });

      const data = await response.json();
      const currentText = (data?.ParsedResults?.[0]?.ParsedText || '').trim();

      console.log('📊 OCR.space response:', {
        variant: index + 1,
        language,
        isErrored: data?.IsErroredOnProcessing,
        textLength: currentText.length,
      });

      if (currentText.length > bestText.length) {
        bestText = currentText;
      }

      if (currentText.length >= 30) {
        console.log('✅ OCR text extraction successful');
        return currentText;
      }
    }
  }

  if (bestText.length > 0) {
    console.log('✅ OCR text extraction partial success');
    return bestText;
  }

  console.warn('⚠️ OCR.space returned no readable text across variants');
  return '';
}

/**
 * Simplified OCR function that relies primarily on OCR.space API
 * with better error handling for serverless environments
 */
export async function extractTextFromImageSimple(imageFile: File): Promise<string> {
  console.log('🔍 Starting OCR text extraction...');
  
  try {
    // Call OCR.space API directly (works both server-side and client-side)
    const extractedText = await performOCR(imageFile);
    
    if (!extractedText || extractedText.trim().length === 0) {
      console.log('ℹ️ No text extracted from image, continuing...');
      return '';
    }
    
    if (extractedText.length < 10) {
      console.warn('⚠️ OCR extracted very little text:', extractedText);
    }
    
    console.log('✅ OCR text extraction successful');
    return extractedText;
    
  } catch (error) {
    console.error('❌ OCR extraction failed:', error);
    
    // Return empty string instead of throwing to allow the process to continue
    console.log('⚠️ OCR failed but continuing with available data...');
    return '';
  }
}

/**
 * Convert File to base64 string - works both client and server side
 */
async function fileToBase64(file: File): Promise<string> {
  // Check if we're in browser environment
  if (typeof window !== 'undefined' && window.FileReader) {
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
  } else {
    // Server-side: convert File/Blob to base64 using Buffer
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return buffer.toString('base64');
    } catch {
      throw new Error('Failed to convert file to base64 in server environment');
    }
  }
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