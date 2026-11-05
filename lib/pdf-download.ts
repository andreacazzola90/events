import { validatePublicPdfUrl } from './pdf-url';

export const MAX_EVENT_PDF_BYTES = 10 * 1024 * 1024;
const PDF_DOWNLOAD_TIMEOUT_MS = 25_000;

export async function downloadPublicPdf(url: URL, signal?: AbortSignal): Promise<Uint8Array> {
  let currentUrl = url;
  const deadline = Date.now() + PDF_DOWNLOAD_TIMEOUT_MS;
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Tempo massimo per il download del PDF superato.');
    const response = await fetch(currentUrl, {
      redirect: 'manual',
      headers: { Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8' },
      signal: AbortSignal.any([AbortSignal.timeout(remaining), ...(signal ? [signal] : [])]),
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirect === 5) throw new Error('Il PDF ha troppi reindirizzamenti.');
      await response.body?.cancel();
      currentUrl = await validatePublicPdfUrl(new URL(location, currentUrl).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Download PDF non riuscito (HTTP ${response.status}).`);

    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_EVENT_PDF_BYTES) {
      await response.body?.cancel();
      throw new Error('Il PDF deve pesare meno di 10 MB.');
    }
    if (!response.body) throw new Error('Il PDF scaricato è vuoto.');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_EVENT_PDF_BYTES) {
          await reader.cancel();
          throw new Error('Il PDF deve pesare meno di 10 MB.');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }
  throw new Error('Download PDF non riuscito.');
}
