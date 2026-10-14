export const SITE_FEEDBACK_RECIPIENT = 'andreacazzola90@gmail.com';
export const SITE_FEEDBACK_SUBJECT = 'Segnalazioni del sito eventi';
export const MAX_SITE_FEEDBACK_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_SITE_FEEDBACK_TITLE_LENGTH = 120;
export const MAX_SITE_FEEDBACK_MESSAGE_LENGTH = 5000;

export function validateSiteFeedbackText(title: unknown, message: unknown): string | null {
  if (typeof title !== 'string' || !title.trim()) return 'Inserisci un titolo.';
  if (title.trim().length > MAX_SITE_FEEDBACK_TITLE_LENGTH) return 'Il titolo è troppo lungo.';
  if (typeof message !== 'string' || !message.trim()) return 'Inserisci un messaggio.';
  if (message.trim().length > MAX_SITE_FEEDBACK_MESSAGE_LENGTH) return 'Il messaggio è troppo lungo.';
  return null;
}

export function validateSiteFeedbackAttachment(type: string, bytes: Uint8Array): boolean {
  if (type === 'application/pdf') return Buffer.from(bytes.subarray(0, 5)).toString('ascii') === '%PDF-';
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') return Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === 'image/webp') {
    return Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' &&
      Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP';
  }
  return false;
}