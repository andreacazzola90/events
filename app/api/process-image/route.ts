import { NextRequest, NextResponse } from 'next/server';
import { analyzeEventImageGroq } from '../../lib/groqVision';


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

    console.log('Ricevuto file:', file.name, 'Size:', file.size, 'Type:', file.type);

    const events = await analyzeEventImageGroq(file);
    const engine = 'groq';

    // Log per debug
  console.log(`Eventi estratti (${engine}):`, events.length);

    return NextResponse.json({
      engine,
      events,
      count: events.length
    });
  } catch (error) {
    // Log dettagliato dell'errore
    console.error('Errore dettagliato:', error);
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process image' },
      { status: 500 }
    );
  }
}