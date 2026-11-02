import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { boundedJson, MessagingError, parseMessagingCommand, safeMessagingError } from '../../../lib/personal-messaging.ts';
import type { Platform } from '../../../lib/personal-messaging.ts';
import { MessagingEngine, bounded } from './engine.ts';

export function createMessagingServer(engine: MessagingEngine, secret: string, configuration: (platform: Platform) => void, deadlineMs = 11000) {
  if (!/^[a-f0-9]{64,}$/i.test(secret)) throw new Error('Invalid worker authentication configuration');
  const expected = Buffer.from(`Bearer ${secret}`);
  const rates = new Map<number, { count: number; until: number }>();
  return createServer({ requestTimeout: 15000, headersTimeout: 10000, maxHeaderSize: 4096 }, async (request, response) => {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    request.once('aborted', cancel); response.once('close', cancel);
    const deadline = setTimeout(cancel, deadlineMs);
    response.setHeader('content-type', 'application/json'); response.setHeader('cache-control', 'no-store');
    try {
      const authorization = Buffer.from(request.headers.authorization || '');
      if (authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) throw new MessagingError('invalid_payload', 401);
      if (request.method !== 'POST' || request.url !== '/command' || !request.headers['content-type']?.startsWith('application/json')) throw new MessagingError('invalid_payload');
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of request.iterator({ destroyOnReturn: false })) { size += chunk.length; if (size > 4096) throw new MessagingError('payload_too_large', 413); chunks.push(chunk); }
      const body = await boundedJson(new Request('http://localhost/command', { method: 'POST', body: Buffer.concat(chunks).toString('utf8') }));
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['owner', 'command'].includes(key))) throw new MessagingError('invalid_payload');
      const { owner, command } = body as { owner: number; command: unknown };
      if (!Number.isSafeInteger(owner) || owner < 1) throw new MessagingError('invalid_payload');
      const now = Date.now();
      for (const [key, rate] of rates) if (rate.until <= now) rates.delete(key);
      const rate = rates.get(owner) || { count: 0, until: now + 60000 };
      if (rates.size > 2000 || ++rate.count > 90) throw new MessagingError('rate_limited', 429);
      rates.set(owner, rate);
      const parsed = parseMessagingCommand(command);
      if (parsed.action !== 'disconnect') configuration(parsed.platform);
      const result = await bounded(engine.execute(owner, parsed, controller.signal), deadlineMs);
      if (controller.signal.aborted) throw new MessagingError('worker_unavailable', 503);
      response.end(JSON.stringify(result));
    } catch (error) {
      controller.abort();
      request.resume();
      response.statusCode = error instanceof MessagingError ? error.status : 503;
      response.end(JSON.stringify({ error: safeMessagingError(error instanceof MessagingError ? error.code : undefined) }));
    } finally { clearTimeout(deadline); request.off('aborted', cancel); response.off('close', cancel); }
  });
}