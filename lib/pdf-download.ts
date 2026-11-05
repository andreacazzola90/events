import { validatePublicPdfUrl } from './pdf-url';
import { fetchCoverResource } from './event-cover-network';

export const MAX_EVENT_PDF_BYTES = 10 * 1024 * 1024;
const PDF_DOWNLOAD_TIMEOUT_MS = 25_000;

export async function downloadPublicPdf(
  url: URL,
  signal?: AbortSignal,
  fetchResource = fetchCoverResource,
): Promise<Uint8Array> {
  const validatedUrl = await validatePublicPdfUrl(url.toString());
  const requestSignal = AbortSignal.any([
    AbortSignal.timeout(PDF_DOWNLOAD_TIMEOUT_MS),
    ...(signal ? [signal] : []),
  ]);
  let resource: Awaited<ReturnType<typeof fetchCoverResource>>;
  try {
    resource = await fetchResource(validatedUrl.toString(), {
      signal: requestSignal,
      maxBytes: MAX_EVENT_PDF_BYTES,
      kind: 'scan',
      maxRedirects: 5,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Resource too large') {
      throw new Error('Il PDF deve pesare meno di 10 MB.');
    }
    throw error;
  }
  if (!['application/pdf', 'application/octet-stream'].includes(resource.contentType)) {
    throw new Error('La fonte pubblica non ha restituito un PDF.');
  }
  if (Buffer.from(resource.bytes.subarray(0, 5)).toString('ascii') !== '%PDF-') {
    throw new Error('Il file selezionato non è un PDF valido.');
  }
  return new Uint8Array(resource.bytes);
}
