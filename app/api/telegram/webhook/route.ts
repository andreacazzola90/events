import { NextResponse } from 'next/server';
import { ingestTelegramUpdate } from '../../../../lib/telegram-store';
import { readTelegramBody, TelegramError } from '../../../../lib/telegram-connection';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const connectionId = new URL(request.url).searchParams.get('connection') || '';
    const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(connectionId) || !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) throw new TelegramError('unauthorized', 401);
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) throw new TelegramError('invalid_content_type', 415);
    let payload: unknown;
    try { payload = JSON.parse(Buffer.from(await readTelegramBody(request)).toString('utf8')); }
    catch (error) { if (error instanceof TelegramError) throw error; throw new TelegramError('invalid_payload'); }
    const result = await ingestTelegramUpdate(connectionId, secret, payload);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof TelegramError ? error.code : 'telegram_storage_unavailable' }, {
      status: error instanceof TelegramError ? error.status : 503, headers: { 'Cache-Control': 'no-store' },
    });
  }
}