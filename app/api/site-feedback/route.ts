import { basename } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { createMailTransport, getMailFrom } from '../../lib/mailer';
import {
  MAX_SITE_FEEDBACK_ATTACHMENT_BYTES,
  SITE_FEEDBACK_RECIPIENT,
  SITE_FEEDBACK_SUBJECT,
  validateSiteFeedbackAttachment,
  validateSiteFeedbackText,
} from '../../../lib/site-feedback';

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 4;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  for (const [ip, entry] of requestCounts) {
    if (entry.resetAt <= now) requestCounts.delete(ip);
  }

  const entry = requestCounts.get(key);
  if (!entry || entry.resetAt <= now) {
    requestCounts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) return true;
  entry.count += 1;
  return false;
}

function getClientKey(request: NextRequest): string {
  return request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export async function POST(request: NextRequest) {
  if (isRateLimited(getClientKey(request))) {
    return NextResponse.json({ error: 'Hai inviato troppe segnalazioni. Riprova più tardi.' }, { status: 429 });
  }

  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_SITE_FEEDBACK_ATTACHMENT_BYTES + 64 * 1024) {
    return NextResponse.json({ error: 'La richiesta supera il limite consentito.' }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida.' }, { status: 400 });
  }

  const title = formData.get('title');
  const message = formData.get('message');
  const validationError = validateSiteFeedbackText(title, message);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const attachmentValue = formData.get('attachment');
  let attachment: { filename: string; content: Buffer; contentType: string } | undefined;
  if (attachmentValue && attachmentValue instanceof File && attachmentValue.size > 0) {
    if (attachmentValue.size > MAX_SITE_FEEDBACK_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: 'L’allegato supera il limite di 5 MB.' }, { status: 413 });
    }
    const bytes = Buffer.from(await attachmentValue.arrayBuffer());
    if (!validateSiteFeedbackAttachment(attachmentValue.type, bytes)) {
      return NextResponse.json({ error: 'Formato allegato non supportato o file non valido.' }, { status: 415 });
    }
    attachment = {
      filename: basename(attachmentValue.name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'allegato',
      content: bytes,
      contentType: attachmentValue.type,
    };
  } else if (attachmentValue !== null) {
    return NextResponse.json({ error: 'Allegato non valido.' }, { status: 400 });
  }

  const transport = createMailTransport();
  if (!transport) {
    return NextResponse.json({ error: 'Invio email non configurato sul server.' }, { status: 503 });
  }

  const referer = request.headers.get('referer') || '';
  const pageUrl = referer.startsWith(request.nextUrl.origin) ? referer : request.nextUrl.origin;
  try {
    await transport.sendMail({
      from: getMailFrom(),
      to: SITE_FEEDBACK_RECIPIENT,
      subject: SITE_FEEDBACK_SUBJECT,
      text: `Titolo: ${(title as string).trim()}\n\nMessaggio:\n${(message as string).trim()}\n\nPagina: ${pageUrl}\nInviato: ${new Date().toISOString()}`,
      attachments: attachment ? [attachment] : [],
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[API /site-feedback] Email send failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Invio email non riuscito. Riprova più tardi.' }, { status: 502 });
  }
}