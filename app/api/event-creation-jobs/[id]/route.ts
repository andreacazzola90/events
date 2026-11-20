import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jobOwnerId, jobResponse, privateJobHeaders } from '../../../../lib/event-creation-job-access';
import { canReadJob, JOB_HISTORY_TTL_MS, validJobId } from '../../../../lib/event-creation-job-policy';
import { generateUniqueSlug } from '../../../../lib/slug-utils';
import type { JobOutcome } from '../../../../lib/event-creation-worker';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const unavailable = () => jobResponse({ error: 'Richiesta non disponibile.' }, 404);
  if (!validJobId(id)) return unavailable();
  const [ownerId, job] = await Promise.all([
    jobOwnerId(),
    prisma.eventCreationJob.findUnique({
      where: { id, createdAt: { gt: new Date(Date.now() - JOB_HISTORY_TTL_MS) } },
      select: { ownerId: true, secretHash: true, status: true, outcome: true, inputExpiresAt: true },
    }),
  ]);
  if (!job || !canReadJob(job, ownerId, request.headers.get('x-event-job-secret') ?? '')) return unavailable();
  const expires = job.inputExpiresAt <= new Date();
  const status = expires && ['queued', 'processing'].includes(job.status) ? 'failed' : job.status;
  const canReview = !expires && (status === 'review' || status === 'failed');
  if (request.nextUrl.searchParams.get('input') === '1') {
    if (!canReview) return unavailable();
    const payload = await prisma.eventCreationJob.findUnique({
      where: { id, inputExpiresAt: { gt: new Date() }, status: { in: ['review', 'failed'] } },
      select: { input: true, mimeType: true },
    });
    if (!payload?.input) return unavailable();
    return new NextResponse(new Uint8Array(payload.input), {
      headers: { ...privateJobHeaders, 'Content-Type': payload.mimeType, 'Content-Disposition': 'attachment', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  const outcome = job.outcome as JobOutcome | null;
  const eventIds = outcome?.events.flatMap(event => event.eventId ? [event.eventId] : []) ?? [];
  const visible = new Map((eventIds.length ? await prisma.event.findMany({
    where: { id: { in: eventIds }, isPublished: true }, select: { id: true, title: true },
  }) : []).map(event => [event.id, event.title]));
  return jobResponse({
    id, status, canReview, reason: outcome?.reason,
    events: outcome?.events.map(({ index, status, eventId }) => ({
      index, status, slug: eventId && visible.has(eventId) ? generateUniqueSlug(visible.get(eventId)!, eventId) : undefined,
    })) ?? [],
  });
}
