import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromImageSimple, parseEventDataEnhanced } from '../../lib/ocr-simple';
import { extractTextFromImage, parseEventData } from '../../lib/ocr';


export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    // Log per debug
    console.log('Ricevuto file:', file.name, 'Size:', file.size, 'Type:', file.type);

    let rawText = '';
    let eventData = null;

    try {
      // Try the simplified OCR first (more reliable in serverless)
      console.log('🔄 Trying simplified OCR approach...');
      rawText = await extractTextFromImageSimple(file);
      eventData = parseEventDataEnhanced(rawText);
      console.log('✅ Simplified OCR successful');
    } catch (simpleOcrError) {
      console.log('⚠️ Simplified OCR failed, trying Tesseract fallback...');
      
      try {
        // Fallback to original OCR with Tesseract.js
        rawText = await extractTextFromImage(file);
        eventData = parseEventData(rawText);
        console.log('✅ Tesseract OCR successful');
      } catch (tesseractError) {
        console.error('❌ Both OCR methods failed:', {
          simple: simpleOcrError instanceof Error ? simpleOcrError.message : simpleOcrError,
          tesseract: tesseractError instanceof Error ? tesseractError.message : tesseractError
        });
        throw simpleOcrError; // Throw the first error which is usually more descriptive
      }
    }
    
    // Log per debug
    console.log('Testo estratto:', rawText);
    console.log('Dati evento estratti:', eventData);

    return NextResponse.json(eventData);
  } catch (error) {
    // Log dettagliato dell'errore
    console.error('Errore dettagliato:', error);
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process image' },
      { status: 500 }
    );
  }
}