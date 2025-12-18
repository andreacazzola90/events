import { NextRequest, NextResponse } from 'next/server';
import { processEventLink } from '../../../lib/event-processor';

export async function POST(request: NextRequest) {
    try {
        const { url } = await request.json();
        
        if (!url) {
            return NextResponse.json(
                { error: 'URL mancante' },
                { status: 400 }
            );
        }

        console.log('Processing URL:', url);

        const result = await processEventLink(url);

        return NextResponse.json(result);

    } catch (error) {
        console.error('Error processing link:', error);
        const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
        
        let status = 500;
        if (errorMessage.includes('mancante') || errorMessage.includes('Facebook')) {
            status = 400;
        } else if (errorMessage.includes('tempo')) {
            status = 408;
        }

        return NextResponse.json(
            { error: `Errore durante l'elaborazione del link: ${errorMessage}` },
            { status }
        );
    }
}
