const cooldowns = new Map<string, number>();
const MAX_RETRIES = 4;
const RETRY_MARGIN_MS = 150;
const MIN_REQUEST_MS = 1000;

export class GroqRateLimitError extends Error {
  readonly status = 429;
  readonly retryAt: number;

  constructor(retryAt: number, cause?: unknown) {
    super('Quota Groq temporaneamente esaurita: elaborazione rinviata.', { cause });
    this.name = 'GroqRateLimitError';
    this.retryAt = retryAt;
  }
}

function headerValue(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  if ('get' in headers && typeof headers.get === 'function') {
    const value: unknown = headers.get(name);
    return typeof value === 'string' ? value : undefined;
  }
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return typeof entry?.[1] === 'string' ? entry[1] : undefined;
}

export function getGroqRetryAt(error: unknown, now = Date.now(), fallbackMs = 1000): number | null {
  if (!error || typeof error !== 'object' || !('status' in error) || error.status !== 429) return null;
  const headers = 'headers' in error ? error.headers : undefined;
  const delays: number[] = [];
  const retryAfter = headerValue(headers, 'retry-after')?.trim();
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - now;
    if (Number.isFinite(delay) && delay >= 0) delays.push(delay);
  }
  const milliseconds = headerValue(headers, 'retry-after-ms')?.trim();
  if (milliseconds && Number.isFinite(Number(milliseconds)) && Number(milliseconds) >= 0) {
    delays.push(Number(milliseconds));
  }
  let detail: unknown = error;
  for (let depth = 0; depth < 3 && detail && typeof detail === 'object'; depth++) {
    const message = 'message' in detail && typeof detail.message === 'string' ? detail.message : '';
    const duration = message.match(/try again in\s+((?:\d+(?:\.\d+)?(?:ms|s|m|h)\s*)+)/i)?.[1];
    if (duration) {
      let delay = 0;
      for (const part of duration.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h)/gi)) {
        delay += Number(part[1]) * ({ ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[part[2].toLowerCase()] ?? 0);
      }
      if (Number.isFinite(delay)) delays.push(delay);
    }
    detail = 'error' in detail ? detail.error : undefined;
  }
  return now + (delays.length ? Math.max(...delays) : fallbackMs) + RETRY_MARGIN_MS;
}

function waitForQuota(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function withGroqRateLimit<T>(
  model: string,
  invoke: (options: { signal: AbortSignal; timeout: number; maxRetries: 0 }) => Promise<T>,
  options: { budgetMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const budgetMs = Math.max(1, Math.floor(options.budgetMs ?? 25_000));
  const deadline = Date.now() + budgetMs;
  const timeoutSignal = AbortSignal.timeout(budgetMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
  let lastError: unknown;

  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    // Other requests in this process may extend the cooldown while we are waiting.
    while ((cooldowns.get(model) ?? 0) > Date.now()) {
      const retryAt = cooldowns.get(model)!;
      if (retryAt + MIN_REQUEST_MS >= deadline) throw new GroqRateLimitError(retryAt, lastError);
      await waitForQuota(retryAt - Date.now(), signal);
    }
    signal.throwIfAborted();
    try {
      return await invoke({ signal, timeout: Math.max(1, deadline - Date.now()), maxRetries: 0 });
    } catch (error) {
      signal.throwIfAborted();
      const retryAt = getGroqRetryAt(error, Date.now(), Math.min(30_000, 1000 * 2 ** attempt));
      if (retryAt === null) throw error;
      lastError = error;
      const nextAttemptAt = Math.max(cooldowns.get(model) ?? 0, retryAt);
      cooldowns.set(model, nextAttemptAt);
      console.warn('[groq-rate-limit] Quota busy', { model, attempt: attempt + 1, retryAt: nextAttemptAt });
      if (attempt >= MAX_RETRIES || nextAttemptAt + MIN_REQUEST_MS >= deadline) {
        throw new GroqRateLimitError(nextAttemptAt, error);
      }
    }
  }
}
