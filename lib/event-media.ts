export const MAX_EVENT_MEDIA_BYTES = 4 * 1024 * 1024;
export const MAX_EVENT_MEDIA_REQUEST_BYTES = MAX_EVENT_MEDIA_BYTES + 64 * 1024;
export const MAX_EVENT_ATTACHMENTS = 10;
export const MAX_COVER_WIDTH = 1920;
export const MAX_COVER_HEIGHT = 1080;

export function getCropOutputSize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Dimensioni crop non valide");
  }
  const scale = Math.min(1, MAX_COVER_WIDTH / width, MAX_COVER_HEIGHT / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export type EventMediaKind = "image" | "pdf";
export type EventMediaValidation =
  | { ok: true; kind: EventMediaKind }
  | { ok: false; error: string };

const EXTENSION_TYPES: Record<string, { mimeType: string; kind: EventMediaKind }> = {
  jpg: { mimeType: "image/jpeg", kind: "image" },
  jpeg: { mimeType: "image/jpeg", kind: "image" },
  png: { mimeType: "image/png", kind: "image" },
  webp: { mimeType: "image/webp", kind: "image" },
  pdf: { mimeType: "application/pdf", kind: "pdf" },
};

export function validateEventMediaFile(
  filename: string,
  mimeType: string,
  signature: Uint8Array,
  size = signature.byteLength,
): EventMediaValidation {
  const extension = filename.split(".").pop()?.toLowerCase() || "";
  const fileType = EXTENSION_TYPES[extension];
  if (!fileType || fileType.mimeType !== mimeType.toLowerCase()) {
    return { ok: false, error: "Tipo file non supportato" };
  }
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_EVENT_MEDIA_BYTES) {
    return { ok: false, error: "Ogni file deve pesare al massimo 4 MiB" };
  }

  const isJpeg = signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
  const isPng = signature.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => signature[index] === byte);
  const isWebp = signature.length >= 12 &&
    String.fromCharCode(...signature.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...signature.subarray(8, 12)) === "WEBP";
  const pdfHeader = String.fromCharCode(...signature.subarray(0, 5)) === "%PDF-";
  const pdfTail = new TextDecoder().decode(signature.subarray(Math.max(0, signature.length - 2048)));
  const isPdf = pdfHeader && pdfTail.includes("%%EOF");
  const signatureMatches = fileType.mimeType === "image/jpeg" ? isJpeg
    : fileType.mimeType === "image/png" ? isPng
      : fileType.mimeType === "image/webp" ? isWebp : isPdf;
  if (!signatureMatches) return { ok: false, error: "Il contenuto del file non corrisponde al formato dichiarato" };

  return { ok: true, kind: fileType.kind };
}
