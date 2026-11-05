import { NextRequest, NextResponse } from 'next/server';
import { MAX_EVENT_PDF_BYTES, processPdfEventDocument } from '../../../lib/pdf-event-processing';
import { validatePublicPdfUrl } from '../../../lib/pdf-url';
import { downloadPublicPdf } from '../../../lib/pdf-download';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let pdfBytes: Uint8Array;
    let sourceUrl: string | undefined;

    if (contentType.includes('application/json')) {
      const body = await request.json();
      const url = await validatePublicPdfUrl(body?.url);
      sourceUrl = url.toString();
      pdfBytes = await downloadPublicPdf(url, request.signal);
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('document');
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'Carica un file PDF.' }, { status: 400 });
      }
      if (file.size > MAX_EVENT_PDF_BYTES) {
        return NextResponse.json({ error: 'Il PDF deve pesare meno di 10 MB.' }, { status: 413 });
      }
      pdfBytes = new Uint8Array(await file.arrayBuffer());
    } else {
      return NextResponse.json({ error: 'Tipo di richiesta non supportato.' }, { status: 415 });
    }

    const result = await processPdfEventDocument(pdfBytes, sourceUrl);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore durante l’elaborazione del PDF.';
    const status = /URL PDF|URL non valido|troppi reindirizzamenti/i.test(message) ? 400 : 422;
    return NextResponse.json({ error: message }, { status });
  }
}