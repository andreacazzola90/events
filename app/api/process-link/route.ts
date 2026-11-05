import { NextRequest, NextResponse } from 'next/server';
import { processEventLink } from '../../../lib/event-processor';
import { validatePublicScanUrl } from '../../../lib/pdf-url';
import { readBoundedRequestBody, RequestBodyTooLargeError } from '../../../lib/request-body-limit';

const MAX_LINK_REQUEST_BYTES = 8 * 1024;

export async function POST(request: NextRequest) {
    try {
        const body = await readBoundedRequestBody(request, MAX_LINK_REQUEST_BYTES);
        const payload: unknown = JSON.parse(new TextDecoder().decode(body));
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return NextResponse.json({ error: 'Richiesta non valida.' }, { status: 400 });
        }
        const url = (payload as Record<string, unknown>).url;
        
        if (typeof url !== 'string' || !url.trim()) {
            return NextResponse.json(
                { error: 'URL mancante' },
                { status: 400 }
            );
        }

        const source = await validatePublicScanUrl(url);
        console.log('Processing URL:', source.toString());

        const result = await processEventLink(source.toString());

        return NextResponse.json(result);

    } catch (error) {
        if (error instanceof RequestBodyTooLargeError) {
            return NextResponse.json({ error: 'Richiesta troppo grande.' }, { status: 413 });
        }
        console.error('Error processing link:', error);
        const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
        
        let status = 500;
        if (errorMessage.includes('mancante') || errorMessage.includes('Facebook') || errorMessage.includes('URL') || errorMessage.includes('pubblico')) {
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
