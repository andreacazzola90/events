import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { boundedJson, MessagingError, parseMessagingCommand, safeMessagingError } from '../../../lib/personal-messaging.ts';
import type { Platform } from '../../../lib/personal-messaging.ts';
import { MessagingEngine, bounded } from './engine.ts';

export function createMessagingServer(engine: MessagingEngine, secret: string, configuration: (platform: Platform) => void, deadlineMs = 11000) {
  if (!/^[a-f0-9]{64,}$/i.test(secret)) throw new Error('Invalid worker authentication configuration');
  const expected = Buffer.from(`Bearer ${secret}`);
  const rates = new Map<number, { count: number; until: number }>();
  return createServer({ requestTimeout: 65000, headersTimeout: 10000, maxHeaderSize: 4096 }, async (request, response) => {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    request.once('aborted', cancel); response.once('close', cancel);
    const requestDeadline = request.url === '/scan' ? 60000 : deadlineMs;
    const deadline = setTimeout(cancel, requestDeadline);
    response.setHeader('content-type', 'application/json'); response.setHeader('cache-control', 'no-store');
    try {
      const authorization = Buffer.from(request.headers.authorization || '');
      if (authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) throw new MessagingError('invalid_payload', 401);
      if (request.method !== 'POST' || !['/command', '/scan', '/ack'].includes(request.url || '') || !request.headers['content-type']?.startsWith('application/json')) throw new MessagingError('invalid_payload');
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of request.iterator({ destroyOnReturn: false })) { size += chunk.length; if (size > (request.url === '/command' ? 4096 : 8192)) throw new MessagingError('payload_too_large', 413); chunks.push(chunk); }
      const body = await boundedJson(new Request(`http://localhost${request.url}`, { method: 'POST', body: Buffer.concat(chunks).toString('utf8') }), request.url === '/command' ? 4096 : 8192);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new MessagingError('invalid_payload');
      const allowedKeys = request.url === '/command' ? ['owner', 'command'] : request.url === '/scan'
        ? ['owner', 'source', 'sourceRevision', 'limit', 'dryRun'] : ['owner', 'source', 'sourceRevision', 'cursor'];
      if (Object.keys(body).some(key => !allowedKeys.includes(key))) throw new MessagingError('invalid_payload');
      const { owner } = body as { owner: number };
      if (!Number.isSafeInteger(owner) || owner < 1) throw new MessagingError('invalid_payload');
      const now = Date.now();
      for (const [key, rate] of rates) if (rate.until <= now) rates.delete(key);
      const rate = rates.get(owner) || { count: 0, until: now + 60000 };
      if (rates.size > 2000 || ++rate.count > 90) throw new MessagingError('rate_limited', 429);
      rates.set(owner, rate);
      let result: unknown;
      if (request.url === '/command') {
        const parsed = parseMessagingCommand((body as { command: unknown }).command);
        if (parsed.action !== 'disconnect') configuration(parsed.platform);
        result = await bounded(engine.execute(owner, parsed, controller.signal), deadlineMs);
      } else {
        configuration('telegram');
        const params = body as { source: string; sourceRevision: number; limit?: number; dryRun?: boolean; cursor?: number };
        if (typeof params.source !== 'string' || !Number.isSafeInteger(params.sourceRevision) ||
          params.sourceRevision < 1 || params.source.length > 200 ||
          (params.limit !== undefined && (!Number.isSafeInteger(params.limit) || params.limit < 1 || params.limit > 30)) ||
          (request.url === '/scan' && (params.dryRun !== undefined && typeof params.dryRun !== 'boolean')) ||
          (request.url === '/ack' && !Number.isSafeInteger(params.cursor))) throw new MessagingError('invalid_payload');
        result = request.url === '/scan'
          ? await bounded(engine.scan(owner, params.source, params.sourceRevision, { dryRun: params.dryRun, limit: params.limit }), requestDeadline)
          : await bounded(engine.acknowledge(owner, params.source, params.sourceRevision, params.cursor!), deadlineMs);
      }
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