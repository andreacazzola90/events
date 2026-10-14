export const MAX_PDF_PROMPT_TEXT_LENGTH = 8000;

const DATE_OR_TIME_PATTERN = /\b(?:lun(?:edì|edi)?|mar(?:tedì|tedi)?|mer(?:coledì|coledi)?|gio(?:vedì|vedi)?|ven(?:erdì|erdi)?|sab(?:ato)?|dom(?:enica)?)\s+\d{1,2}\b|\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b|\b\d{1,2}:\d{2}\b|\bore?\s+\d{1,2}(?::\d{2})?/i;
const EVENT_DETAIL_PATTERN = /\b(?:talk|lab(?:oratorio)?|visita|mostra|spettacolo|concerto|incontro|evento|ingresso|gratuit[oa]|organizzat[oa]|ore|via|piazza|palazzo|teatro|auditorium)\b|€|\beuro\b/i;
const EVENT_TYPE_PATTERN = /\b(?:talk|lab(?:oratorio)?|visita(?:\s+guidata)?|mostra|spettacolo|concerto|incontro|formazione|workshop|evento\s+speciale|porte\s+aperte)\b/i;

interface SummaryLine {
  text: string;
  index: number;
  score: number;
}

function scoreLine(text: string, index: number): number {
  let score = index === 0 ? 1 : 0;
  if (DATE_OR_TIME_PATTERN.test(text)) score += 9;
  if (EVENT_DETAIL_PATTERN.test(text)) score += 4;
  if (text.length <= 120 && /[A-ZÀ-Ü]/.test(text) && text === text.toLocaleUpperCase('it-IT')) score += 11;
  if (text.length >= 24) score += 1;
  return score;
}

export function summarizePdfPages(pages: string[], maxChars = MAX_PDF_PROMPT_TEXT_LENGTH) {
  const originalText = pages.join('\n\n').trim();
  if (originalText.length <= maxChars) return { text: originalText, summarized: false };

  const candidatePages = pages.flatMap((page, pageIndex) => {
    const lines = page
      .split(/\r?\n/)
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(line => line && !/^\d{1,3}$/.test(line));
    const titleLines = lines.filter(line =>
      line.length > 5 && line.length <= 120 && /[A-ZÀ-Ü]/.test(line) && line === line.toLocaleUpperCase('it-IT'),
    );
    const isEventPage =
      (DATE_OR_TIME_PATTERN.test(lines.join(' ')) && (titleLines.length > 0 || EVENT_TYPE_PATTERN.test(lines.join(' ')))) ||
      titleLines.length >= 3;
    if (!isEventPage) return [];

    const lineCounts = new Map<string, number>();
    lines.forEach(line => lineCounts.set(line, (lineCounts.get(line) || 0) + 1));
    const candidates: SummaryLine[] = lines
      .filter(line => lineCounts.get(line) === 1)
      .map((text, index) => ({ text, index, score: scoreLine(text, index) }))
      .sort((left, right) => right.score - left.score || left.index - right.index);

    return candidates.length ? [{ pageNumber: pageIndex + 1, candidates }] : [];
  });

  if (!candidatePages.length) {
    return { text: originalText.slice(0, maxChars), summarized: true };
  }

  const pageBudget = Math.floor((maxChars - Math.max(0, candidatePages.length - 1)) / candidatePages.length);
  const summaries = candidatePages.map(({ pageNumber, candidates }) => {
    const label = `[Pagina ${pageNumber}] `;
    let remaining = Math.max(0, pageBudget - label.length);
    const selected: string[] = [];

    for (const candidate of candidates) {
      if (remaining <= 0) break;
      const separatorLength = selected.length ? 3 : 0;
      if (remaining <= separatorLength) break;
      const excerpt = candidate.text.slice(0, remaining - separatorLength);
      selected.push(excerpt);
      remaining -= excerpt.length + separatorLength;
    }

    return label + selected.join(' | ');
  });

  return { text: summaries.join('\n').slice(0, maxChars), summarized: true };
}