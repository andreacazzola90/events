export const DRAFT_CROP_FAILURE_MESSAGES = {
  'rate-limited': 'Quota gratuita AI temporaneamente esaurita.',
  'timeout': 'Il servizio AI non ha risposto in tempo.',
  'not-configured': 'Servizio AI non configurato.',
  'bounds-rejected': 'La locandina non e stata individuata con sufficiente certezza.',
  'verification-rejected': 'Il ritaglio non ha superato il controllo privacy.',
  'image-invalid': 'Formato o dimensioni immagine non supportati.',
  'service-unavailable': 'Servizio AI temporaneamente non disponibile.',
} as const;
export type DraftImageCropFailure = keyof typeof DRAFT_CROP_FAILURE_MESSAGES;
export type DraftImageCrop = { result: Promise<Blob | undefined>; cancel: () => void; readonly failureReason?: DraftImageCropFailure };
export type DraftImageCropStatus = 'idle' | 'processing' | 'completed' | 'failed';
export type DraftImageScan = { isCurrent: () => boolean; registerCrop: (crop: DraftImageCrop) => void };

export function startDraftImageCrop(file: File): DraftImageCrop {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(55_000)]);
  let failureReason: DraftImageCropFailure | undefined;
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
      if (!signal.aborted && blob.type === 'image/jpeg' && blob.size > 0) return blob;
      failureReason = signal.aborted ? 'timeout' : 'image-invalid';
      return undefined;
    } catch {
      failureReason = signal.aborted ? 'timeout' : 'service-unavailable';
      return undefined;
    }
  })();
  return { result, cancel: () => controller.abort(), get failureReason() { return failureReason; } };
}