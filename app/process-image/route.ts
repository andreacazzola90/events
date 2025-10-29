import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromImage, parseEventData } from '@/lib/ocr';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      );
    }

    // Extract text from image
    const rawText = await extractTextFromImage(file);
    
    // Parse the extracted text into structured event data
    const eventData = parseEventData(rawText);

    return NextResponse.json(eventData);
  } catch (error) {
    console.error('Error processing image:', error);
    return NextResponse.json(
      { error: 'Failed to process image' },
      { status: 500 }
    );
  }
}