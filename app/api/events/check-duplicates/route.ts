import { NextRequest, NextResponse } from 'next/server';
import { findDuplicateEvent, type DuplicateCandidate } from '../../../../lib/event-duplicates';

const MAX_EVENTS = 30;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const events: unknown = body?.events;
  if (!Array.isArray(events) || events.length > MAX_EVENTS) {
    return NextResponse.json({ error: 'Invalid events payload' }, { status: 400 });
  }

  const duplicates = await Promise.all(
    events.map((ev: DuplicateCandidate) =>
      findDuplicateEvent({
        title: typeof ev?.title === 'string' ? ev.title : '',
        date: typeof ev?.date === 'string' ? ev.date : '',
        sourceUrl: typeof ev?.sourceUrl === 'string' ? ev.sourceUrl : '',
      }),
    ),
  );

  return NextResponse.json({ duplicates });
}
