export const DRAFT_CROP_FAILURE_MESSAGES = {
  'rate-limited': 'Quota gratuita AI temporaneamente esaurita.',
  'timeout': 'Il servizio AI non ha risposto in tempo.',
  'not-configured': 'Servizio AI non configurato.',
  'bounds-rejected': 'La locandina non e stata individuata con sufficiente certezza.',
  'verification-rejected': 'Il ritaglio automatico non ha prodotto un’immagine pulita.',
  'image-invalid': 'Formato o dimensioni immagine non supportati.',
  'service-unavailable': 'Servizio AI temporaneamente non disponibile.',
} as const;
export type DraftImageCropFailure = keyof typeof DRAFT_CROP_FAILURE_MESSAGES;
export type DraftImageCropBox = { x: number; y: number; width: number; height: number };
export type DraftImageCrop = {
  result: Promise<Blob | undefined>; cancel: () => void; readonly failureReason?: DraftImageCropFailure;
  /** Automatic crop rectangle, normalized 0..1 to the original image. */
  readonly box?: DraftImageCropBox;
};
export type DraftImageCropStatus = 'idle' | 'processing' | 'completed' | 'failed';
export type DraftImageScan = { isCurrent: () => boolean; registerCrop: (crop: DraftImageCrop) => void };

export function prepareDraftForPublication<Event extends { originalImageUrl?: string; originalImageCrop?: DraftImageCropBox }>(event: Event): Event {
  const publishable = { ...event };
  delete publishable.originalImageUrl;
  delete publishable.originalImageCrop;
  return publishable;
}

let activeCoverRequests = 0;
const coverRequestQueue: Array<() => void> = [];

export function fetchDraftCover(url: string, options: RequestInit & { signal: AbortSignal }, timeoutMs: number): Promise<Response> {
  return new Promise((resolve, reject) => {
    const cancel = () => {
      const index = coverRequestQueue.indexOf(start);
      if (index >= 0) coverRequestQueue.splice(index, 1);
      reject(new Error('Cover request cancelled'));
    };
    const start = () => {
      options.signal.removeEventListener('abort', cancel);
      if (options.signal.aborted) { cancel(); return; }
      activeCoverRequests++;
      void Promise.resolve().then(() => fetch(url, {
        ...options, signal: AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]),
      })).then(resolve, reject).finally(() => {
        activeCoverRequests--;
        coverRequestQueue.shift()?.();
      });
    };
    if (options.signal.aborted) { cancel(); return; }
    options.signal.addEventListener('abort', cancel, { once: true });
    if (activeCoverRequests < 2) start();
    else coverRequestQueue.push(start);
  });
}

export function startDraftImageCrop(file: File): DraftImageCrop {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(55_000)]);
  let failureReason: DraftImageCropFailure | undefined;
  let box: DraftImageCropBox | undefined;
  const result = (async () => {
    try {
      const form = new FormData();
      form.append('image', file);
      const response = await fetch('/api/crop-image', { method: 'POST', body: form, signal });
      const reason = response.headers?.get('x-image-crop-reason');
      if (reason && Object.hasOwn(DRAFT_CROP_FAILURE_MESSAGES, reason)) failureReason = reason as DraftImageCropFailure;
      if (!response.ok || response.status === 204 || signal.aborted) {
        failureReason ??= signal.aborted ? 'timeout' : response.status === 400 || response.status === 413 ? 'image-invalid' : 'service-unavailable';
        return undefined;
      }
      const blob = await response.blob();
      if (!signal.aborted && blob.type === 'image/jpeg' && blob.size > 0) {
        box = parseDraftCropBox(response.headers?.get('x-image-crop-box'));
        return blob;
      }
      failureReason = signal.aborted ? 'timeout' : 'image-invalid';
      return undefined;
    } catch {
      failureReason = signal.aborted ? 'timeout' : 'service-unavailable';
      return undefined;
    }
  })();
  return { result, cancel: () => controller.abort(), get failureReason() { return failureReason; }, get box() { return box; } };
}

export function parseDraftCropBox(header: string | null | undefined): DraftImageCropBox | undefined {
  const values = (header || '').split(',').map(Number);
  if (values.length !== 4 || values.some(value => !Number.isFinite(value) || value < 0 || value > 1)) return undefined;
  const [x, y, width, height] = values;
  if (width <= 0 || height <= 0 || x + width > 1.001 || y + height > 1.001) return undefined;
  return { x, y, width, height };
}