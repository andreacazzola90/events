import { NextRequest, NextResponse } from 'next/server';
import type { EventData } from '../../../types/event';
import { processEventLink } from '../../../../lib/event-processor';
import { processPdfEventDocument } from '../../../../lib/pdf-event-processing';
import { downloadPublicPdf } from '../../../../lib/pdf-download';
import { validatePublicPdfUrl, validatePublicScanUrl } from '../../../../lib/pdf-url';
import { buildRescanProposal, matchRescannedEvent } from '../../../../lib/event-rescan';

export const maxDuration = 60;

const textFields = {
  title: 160, description: 5_000, date: 40, time: 40, location: 300, organizer: 200,
  category: 100, price: 100, rawText: 9_000, sourceUrl: 2_000,
} as const;

function readText(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function readEvent(value: unknown): EventData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const event = Object.fromEntries(Object.entries(textFields).map(([field, maximum]) => [
    field, readText(source[field], maximum),
  ])) as unknown as EventData;
  const evidence = source.scanEvidence;
  if (evidence && typeof evidence === 'object' && !Array.isArray(evidence)) {
    const pages = (evidence as Record<string, unknown>).pageNumbers;
    event.scanEvidence = {
      candidateId: readText((evidence as Record<string, unknown>).candidateId, 120),
      pageNumbers: Array.isArray(pages) ? pages.filter((page): page is number => Number.isSafeInteger(page) && (page as number) > 0).slice(0, 10) : [],
      quote: readText((evidence as Record<string, unknown>).quote, 1_200),
    };
  }
  return event;
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida.' }, { status: 400 });
  }
  const current = readEvent(body.event);
  if (!current?.title) return NextResponse.json({ error: 'Bozza non valida.' }, { status: 400 });
  const sourceUrl = current.sourceUrl;
  if (!sourceUrl) return NextResponse.json({ error: 'Aggiungi un URL pubblico della fonte prima di riscansionare.' }, { status: 400 });

  try {
    const url = await validatePublicScanUrl(sourceUrl);
    const isPdf = url.pathname.toLowerCase().endsWith('.pdf');
    let candidates: EventData[];
    let scan: { status?: string; counts?: unknown; unscannedPages?: number } | undefined;
    if (isPdf) {
      const pdfUrl = await validatePublicPdfUrl(url.toString());
      const result = await processPdfEventDocument(await downloadPublicPdf(pdfUrl, request.signal), pdfUrl.toString());
      candidates = result.events;
      scan = {
        status: result.debug.scanStatus,
        counts: result.debug.scanCounts,
        ...(result.debug.unscannedPages ? { unscannedPages: result.debug.unscannedPages } : {}),
      };
    } else {
      const result = await processEventLink(url.toString(), { verbose: false });
      candidates = result.events;
    }

    const match = matchRescannedEvent(current, candidates);
    if (match.status !== 'matched') {
      return NextResponse.json({
        status: match.status,
        error: match.status === 'ambiguous'
          ? 'La fonte contiene più eventi compatibili: la bozza non è stata modificata.'
          : 'La fonte non contiene una corrispondenza sicura: la bozza non è stata modificata.',
        scan,
      }, { status: match.status === 'ambiguous' ? 409 : 422 });
    }
    return NextResponse.json({
      status: 'matched',
      proposal: buildRescanProposal(current, match.event),
      matchedEvent: { title: match.event.title, date: match.event.date, time: match.event.time, location: match.event.location },
      scan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Impossibile riscansionare la fonte.';
    const status = /URL|pubblico|troppi reindirizzamenti/i.test(message) ? 400 : /timeout|tempo/i.test(message) ? 408 : 502;
    return NextResponse.json({ status: 'failed', error: message }, { status });
  }
}
