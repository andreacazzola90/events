import { NextRequest, NextResponse } from 'next/server';
import { MAX_EVENT_PDF_BYTES, processPdfEventDocument } from '../../../lib/pdf-event-processing';
import { validatePublicPdfUrl } from '../../../lib/pdf-url';

export const maxDuration = 60;

async function downloadPdf(url: URL): Promise<Uint8Array> {
  let currentUrl = url;
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    const response = await fetch(currentUrl, {
      redirect: 'manual',
      headers: { Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8' },
      signal: AbortSignal.timeout(25000),
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirect === 5) throw new Error('Il PDF ha troppi reindirizzamenti.');
      currentUrl = await validatePublicPdfUrl(new URL(location, currentUrl).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Download PDF non riuscito (HTTP ${response.status}).`);

    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_EVENT_PDF_BYTES) {
      throw new Error('Il PDF deve pesare meno di 10 MB.');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_EVENT_PDF_BYTES) throw new Error('Il PDF deve pesare meno di 10 MB.');
    return bytes;
  }
  throw new Error('Download PDF non riuscito.');
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let pdfBytes: Uint8Array;
    let sourceUrl: string | undefined;

    if (contentType.includes('application/json')) {
      const body = await request.json();
      const url = await validatePublicPdfUrl(body?.url);
      sourceUrl = url.toString();
      pdfBytes = await downloadPdf(url);
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