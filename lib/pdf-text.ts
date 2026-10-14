export const MAX_PDF_PROMPT_TEXT_LENGTH = 8000;

export function limitPdfPromptText(value: string) {
  const text = value.trim();
  return {
    text: text.slice(0, MAX_PDF_PROMPT_TEXT_LENGTH),
    truncated: text.length > MAX_PDF_PROMPT_TEXT_LENGTH,
  };
}