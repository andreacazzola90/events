import { tmpdir } from 'node:os';
import sharp from 'sharp';

export type OcrBox = { x0: number; y0: number; x1: number; y1: number };
export type OcrWord = { text: string; confidence: number; bbox: OcrBox };
export type OcrLine = { text: string; confidence: number; bbox: OcrBox; words: OcrWord[] };
export type PosterSectionEvent = { title: string; date?: string };
/** Pixel rectangle of one event inside the poster. */
export type PosterSection = { index: number; left: number; top: number; width: number; height: number };
export type NormalizedPosterSectionCrop = { x: number; y: number; width: number; height: number };

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MIN_TITLE_SCORE = 0.6;
const CLEAN_WORD_CONFIDENCE = 80;
const NOISY_LINE_CONFIDENCE = 50;

function tokens(value: string): string[] {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(token => token.length >= 2 || /\d/.test(token));
}

function titleScore(title: string[], line: string[]): number {
  if (!title.length) return 0;
  const available = new Set(line);
  return title.filter(token => available.has(token)).length / title.length;
}

/** Tie-breaker: prefers lines without extra words, so "Jazz" does not take the "Jazz e poesia" line. */
function titleSimilarity(title: string[], line: string[]): number {
  const union = new Set([...title, ...line]);
  return union.size ? title.filter(token => line.includes(token)).length / union.size : 0;
}

function dateParts(value: string | undefined): { day: string; month: string } | null {
  const iso = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const local = value?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const [day, month] = iso ? [iso[3], iso[2]] : local ? [local[1], local[2]] : [];
  const monthName = MONTHS[Number(month) - 1];
  return day && monthName ? { day: String(Number(day)), month: monthName } : null;
}

function mentionsDate(line: OcrLine, date: { day: string; month: string }): boolean {
  const lineTokens = tokens(line.text);
  return lineTokens.includes(date.day) && lineTokens.some(token => token.length >= 3 && date.month.startsWith(token));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

/** Horizontal extent of the dominant text column; isolated logos or artwork far to the side are ignored. */
function cleanExtent(lines: OcrLine[], maxGap: number): { x0: number; x1: number } | null {
  const words = lines.flatMap(line => line.words)
    .filter(word => word.confidence >= CLEAN_WORD_CONFIDENCE && tokens(word.text).length)
    .sort((a, b) => a.bbox.x0 - b.bbox.x0);
  const columns: Array<{ x0: number; x1: number; weight: number }> = [];
  for (const word of words) {
    const column = columns.at(-1);
    if (column && word.bbox.x0 <= column.x1 + maxGap) {
      column.x1 = Math.max(column.x1, word.bbox.x1);
      column.weight += word.bbox.x1 - word.bbox.x0;
    } else {
      columns.push({ x0: word.bbox.x0, x1: word.bbox.x1, weight: word.bbox.x1 - word.bbox.x0 });
    }
  }
  const main = columns.sort((a, b) => b.weight - a.weight)[0];
  return main ? { x0: main.x0, x1: main.x1 } : null;
}

/**
 * Locates the block of each event (date + title + details) on a poster listing several events,
 * using OCR line boxes. Events whose title cannot be found are omitted.
 */
export function locateEventSections(
  ocrLines: OcrLine[],
  events: PosterSectionEvent[],
  size: { width: number; height: number },
): PosterSection[] {
  const lines = ocrLines.filter(line => line.bbox.y1 > line.bbox.y0).sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const lineHeight = median(lines.filter(line => line.confidence >= NOISY_LINE_CONFIDENCE).map(line => line.bbox.y1 - line.bbox.y0)) || 20;
  const lineTokens = lines.map(line => tokens(line.text));

  const candidates = events.flatMap((event, index) => {
    const title = [...new Set(tokens(event.title))];
    return lines.map((_, line) => ({
      index, line, score: titleScore(title, lineTokens[line]), similarity: titleSimilarity(title, lineTokens[line]),
    })).filter(candidate => candidate.score >= MIN_TITLE_SCORE);
  }).sort((a, b) => b.score - a.score || b.similarity - a.similarity || a.line - b.line);

  const titleLine = new Map<number, number>();
  const usedLines = new Set<number>();
  for (const candidate of candidates) {
    if (titleLine.has(candidate.index) || usedLines.has(candidate.line)) continue;
    titleLine.set(candidate.index, candidate.line);
    usedLines.add(candidate.line);
  }

  const anchors = [...titleLine.entries()].map(([index, line]) => {
    const date = dateParts(events[index].date);
    let first = line;
    for (let above = line - 1; above >= 0 && date; above--) {
      // A date heading shared with an event printed above belongs to that event.
      if (usedLines.has(above) || lines[line].bbox.y0 - lines[above].bbox.y1 > 2 * lineHeight) break;
      if (mentionsDate(lines[above], date)) { first = above; break; }
    }
    const extent = cleanExtent(lines.slice(first, line + 1), 3 * lineHeight) ?? lines[line].bbox;
    return { index, first, line, top: lines[first].bbox.y0, x0: extent.x0, x1: extent.x1 };
  });

  const sections = anchors.map(anchor => {
    const overlaps = (other: { x0: number; x1: number }) => other.x0 < anchor.x1 && other.x1 > anchor.x0;
    const next = anchors.filter(other => other !== anchor && overlaps(other) && other.top > anchor.top)
      .sort((a, b) => a.top - b.top)[0];
    // Lines of side-by-side columns share the vertical band but belong to other events.
    const sameColumn = (line: OcrLine) => line.bbox.x0 < anchor.x1 + lineHeight && line.bbox.x1 > anchor.x0 - lineHeight;
    let blockLines: OcrLine[];
    let limit = next ? next.top : size.height;
    if (next) {
      blockLines = lines.slice(anchor.first, next.first).filter(line => line.bbox.y0 < next.top && sameColumn(line));
    } else {
      blockLines = lines.slice(anchor.first, anchor.line + 1).filter(sameColumn);
      let bottom = lines[anchor.line].bbox.y1;
      for (const line of lines.slice(anchor.line + 1).filter(sameColumn)) {
        if (line.confidence < NOISY_LINE_CONFIDENCE || line.bbox.y0 - bottom > 1.8 * lineHeight) {
          limit = Math.max(bottom, line.bbox.y0);
          break;
        }
        blockLines.push(line);
        bottom = Math.max(bottom, line.bbox.y1);
      }
    }
    const extent = cleanExtent(blockLines, 3 * lineHeight) ?? { x0: anchor.x0, x1: anchor.x1 };
    const contentBottom = Math.max(...blockLines.flatMap(line => line.words)
      .filter(word => word.confidence >= NOISY_LINE_CONFIDENCE && word.bbox.x0 >= extent.x0 && word.bbox.x1 <= extent.x1)
      .map(word => word.bbox.y1), lines[anchor.line].bbox.y1);
    const padX = Math.max(16, Math.round(size.width * 0.04));
    const padY = Math.round(lineHeight * 0.5);
    const left = Math.max(0, extent.x0 - padX);
    const right = Math.min(size.width, extent.x1 + padX);
    const top = Math.max(0, anchor.top - padY);
    const bottom = Math.min(size.height, limit - 2, contentBottom + padY);
    return { index: anchor.index, left, top, width: right - left, height: bottom - top };
  });

  return sections.filter(section => section.width >= 32 && section.height >= 16 &&
    section.width * section.height < size.width * size.height * 0.6)
    .sort((a, b) => a.index - b.index);
}

export function normalizePosterSectionCrop(
  section: PosterSection,
  size: { width: number; height: number },
): NormalizedPosterSectionCrop {
  return {
    x: section.left / size.width,
    y: section.top / size.height,
    width: section.width / size.width,
    height: section.height / size.height,
  };
}

/** Crops one section and pads it to 16:9 with the poster background color, without distortion. */
export async function renderPosterSection(image: Buffer, section: PosterSection): Promise<Buffer> {
  const crop = await sharp(image).extract({ left: section.left, top: section.top, width: section.width, height: section.height })
    .png().toBuffer();
  const { dominant } = await sharp(crop).stats();
  const targetRatio = 16 / 9;
  const ratio = section.width / section.height;
  const width = ratio >= targetRatio ? section.width : Math.ceil(section.height * targetRatio);
  const height = ratio >= targetRatio ? Math.ceil(section.width / targetRatio) : section.height;
  const horizontal = width - section.width;
  const vertical = height - section.height;
  return sharp(crop)
    .extend({
      left: Math.floor(horizontal / 2), right: Math.ceil(horizontal / 2),
      top: Math.floor(vertical / 2), bottom: Math.ceil(vertical / 2),
      background: { r: dominant.r, g: dominant.g, b: dominant.b },
    })
    .resize({ width: 1600, height: 900, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** Runs Italian OCR on an EXIF-rotated image and returns line/word boxes. */
export async function readPosterLines(image: Buffer, signal?: AbortSignal): Promise<OcrLine[]> {
  const { createWorker } = await import('tesseract.js');
  const starting = createWorker('ita', 1, { cachePath: tmpdir() });
  let worker: Awaited<typeof starting>;
  try {
    worker = await untilAborted(starting, signal);
  } catch (error) {
    void starting.then(started => started.terminate()).catch(() => undefined);
    throw error;
  }
  try {
    const { data } = await untilAborted(worker.recognize(image, {}, { blocks: true }), signal);
    return (data.blocks ?? []).flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines.map(line => ({
      text: line.text.trim(),
      confidence: line.confidence,
      bbox: line.bbox,
      words: line.words.map(word => ({ text: word.text, confidence: word.confidence, bbox: word.bbox })),
    }))));
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}

/** tesseract.js leaves pending jobs unsettled when its worker is terminated, so aborts must reject on their own. */
function untilAborted<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new Error('OCR aborted'));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error('OCR aborted'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Finds and renders one 16:9 detail image per located event. */
export async function extractEventSections(image: Buffer, events: PosterSectionEvent[], signal?: AbortSignal) {
  const source = await sharp(image).rotate().toBuffer({ resolveWithObject: true });
  const lines = await readPosterLines(source.data, signal);
  const sections = locateEventSections(lines, events, source.info);
  return Promise.all(sections.map(async section => ({
    ...section,
    crop: normalizePosterSectionCrop(section, source.info),
    image: await renderPosterSection(source.data, section),
  })));
}
