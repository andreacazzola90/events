import { NextRequest, NextResponse } from 'next/server';
import { MAX_EVENT_MEDIA_BYTES, MAX_EVENT_MEDIA_REQUEST_BYTES, validateEventMediaFile } from '../../../lib/event-media';
import { extractEventSections, type PosterSectionEvent } from '../../../lib/poster-sections';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_EVENTS = 30;

function parseEvents(value: FormDataEntryValue | null): PosterSectionEvent[] | null {
  if (typeof value !== 'string') return null;
  try {
    const events: unknown = JSON.parse(value);
    if (!Array.isArray(events) || events.length < 2 || events.length > MAX_EVENTS) return null;
    return events.map(event => {
      const { title, date } = (event ?? {}) as { title?: unknown; date?: unknown };
      return { title: typeof title === 'string' ? title.slice(0, 200) : '', date: typeof date === 'string' ? date.slice(0, 20) : undefined };
    });
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' };
  if (Number(request.headers.get('content-length')) > MAX_EVENT_MEDIA_REQUEST_BYTES + 32 * 1024) {
    return NextResponse.json({ error: 'Immagine troppo grande' }, { status: 413, headers });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get('image');
  const events = parseEvents(form?.get('events') ?? null);
  if (!(file instanceof File) || !events) return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400, headers });
  if (file.size > MAX_EVENT_MEDIA_BYTES) return NextResponse.json({ error: 'Immagine troppo grande' }, { status: 413, headers });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const media = validateEventMediaFile(file.name, file.type, bytes, file.size);
  if (!media.ok || media.kind !== 'image') return NextResponse.json({ error: 'Immagine non valida' }, { status: 400, headers });

  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(25_000)]);
    const sections = await extractEventSections(Buffer.from(bytes), events, signal);
    if (sections.length < events.length) {
      console.warn(`[poster-sections] Located ${sections.length}/${events.length} events`);
    }
    return NextResponse.json({
      sections: sections.map(section => ({
        index: section.index,
        image: `data:image/jpeg;base64,${section.image.toString('base64')}`,
      })),
    }, { headers });
  } catch (error) {
    console.warn('[poster-sections] OCR unavailable:', error instanceof Error ? error.message : error);
    return NextResponse.json({ sections: [] }, { headers });
  }
}
