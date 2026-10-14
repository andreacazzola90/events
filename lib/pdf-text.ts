export const MAX_PDF_PROMPT_TEXT_LENGTH = 5000;

const DATE_OR_TIME_PATTERN = /\b(?:lun(?:edì|edi)?|mar(?:tedì|tedi)?|mer(?:coledì|coledi)?|gio(?:vedì|vedi)?|ven(?:erdì|erdi)?|sab(?:ato)?|dom(?:enica)?)\s+\d{1,2}\b|\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b|\b\d{1,2}:\d{2}\b|\bore?\s+\d{1,2}(?::\d{2})?/i;
const EVENT_DETAIL_PATTERN = /\b(?:talk|lab(?:oratorio)?|visita|mostra|spettacolo|concerto|incontro|evento|ingresso|gratuit[oa]|organizzat[oa]|ore|via|piazza|palazzo|teatro|auditorium)\b|€|\beuro\b/i;
const EVENT_TYPE_PATTERN = /\b(?:talk|lab(?:oratorio)?|visita(?:\s+guidata)?|mostra|spettacolo|concerto|incontro|formazione|workshop|evento\s+speciale|porte\s+aperte)\b/i;
const GENERIC_PDF_HEADING_PATTERN = /^(?:FESTIVAL DELLA SCIENZA|DELL'ALTO VICENTINO|IX EDIZIONE|EVENTI|EVENTI SPECIALI|MOSTRE|FESAV LAB|TALK|LAB|LABORATORIO|VISITA(?: GUIDATA)?|SPETTACOLO|FORMAZIONE|ORE)(?:\s*[-:]?\s*(?:ORE\s*)?\d{1,2}(?::\d{2})?(?:\s*[-–]\s*\d{1,2}(?::\d{2})?)?)?$/i;
const NON_EVENT_PDF_TITLE_PATTERN = /^(?:SCHIO\s*\(VI\)\s*\d{1,2}\s*[-–]\s*\d{1,2}\s+OTTOBRE\s+\d{4}|FESTIVAL DELLA SCIENZA DELL'ALTO VICENTINO(?:\s*[-–:]\s*IX EDIZIONE)?|DELL'ALTO VICENTINO|IX EDIZIONE|LANIFICIO CONTE|I LUOGHI DEL FESTIVAL|MARANO VICENTINO|VALDAGNO|DUEVILLE|MERCHANDISING|BOOKSHOP FOOD AND DRINK.*|CON IL SOSTEGNO.*|CON IL PATROCINIO.*|MAIN SPONSOR.*|.*SPONSOR(?: TECNICI| MEDIA PARTNER)?.*)$/i;

export function isNonEventPdfTitle(value: string): boolean {
  return NON_EVENT_PDF_TITLE_PATTERN.test(value.trim());
}

export function extractPdfTitleCandidates(pages: string[]): string[] {
  const titles = new Set<string>();

  for (const page of pages) {
    let titleLines: string[] = [];
    const flushTitle = () => {
      const title = titleLines.join(' ').replace(/\s+/g, ' ').trim();
      if (title.length >= 8 && title.length <= 140) titles.add(title);
      titleLines = [];
    };

    const lines = page.split(/\r?\n/).map(value => value.replace(/\s+/g, ' ').trim()).filter(Boolean);
    for (const line of lines) {
      const isUppercase = /[A-ZÀ-Ü]/.test(line) && line === line.toLocaleUpperCase('it-IT');
      const lowercaseLine = line.toLocaleLowerCase('it-IT');
      const isDateHeading = /^(?:lun(?:edì|edi)?|mar(?:tedì|tedi)?|mer(?:coledì|coledi)?|gio(?:vedì|vedi)?|ven(?:erdì|erdi)?|sabato|domenica)\s+.*\d{1,2}\s/.test(lowercaseLine);
      const isEventTypeAndTime = /^(?:TALK|LAB|VISITA(?: GUIDATA)?|SPETTACOLO|FORMAZIONE)\b.*\b(?:ORE\s*)?\d{1,2}:\d{2}/i.test(line);
      const isCandidate = isUppercase && line.length >= 5 && line.length <= 100 &&
        !/^\d{1,3}$/.test(line) && !isDateHeading && !isEventTypeAndTime && !GENERIC_PDF_HEADING_PATTERN.test(line);

      if (!isCandidate) {
        flushTitle();
        continue;
      }

      const nextLength = titleLines.join(' ').length + line.length + (titleLines.length ? 1 : 0);
      if (nextLength > 140) flushTitle();
      titleLines.push(line);
    }

    flushTitle();
  }

  return [...titles].slice(0, 100);
}

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