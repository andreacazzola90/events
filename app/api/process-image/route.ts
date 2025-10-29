import { NextRequest, NextResponse } from 'next/server';
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

    // Extract text from image using the file directly
    const rawText = await extractTextFromImage(file);
    
    // Log per debug
    console.log('Testo estratto:', rawText);

    // Parse the extracted text into structured event data
    const eventData = parseEventData(rawText);

    // Log per debug
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