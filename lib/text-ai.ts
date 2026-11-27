import OpenAI from 'openai';
import { getGroqRetryAt, GroqRateLimitError, withGroqRateLimit } from './groq-rate-limit';

type TextProviderName = 'groq' | 'cloudflare' | 'openrouter';
type CompletionRequest = Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, 'model'> & {
  reasoning_effort?: 'low' | 'medium' | 'high' | 'xhigh';
};

type Provider = {
  name: TextProviderName;
  apiKey: string;
  baseURL: string;
  model: string;
};

type TextAIOptions = {
  budgetMs?: number;
  providerTimeoutMs?: number;
  signal?: AbortSignal;
  logFailures?: boolean;
};

export class TextAIError extends Error {
  readonly kind: 'configuration' | 'permanent' | 'unavailable' | 'timeout';
  readonly provider?: string;
  readonly status?: number;

  constructor(
    kind: TextAIError['kind'],
    message: string,
    details: { provider?: string; status?: number } = {},
  ) {
    super(message);
    this.name = 'TextAIError';
    this.kind = kind;
    this.provider = details.provider;
    this.status = details.status;
  }
}

const providerNames = new Set<TextProviderName>(['groq', 'cloudflare', 'openrouter']);

function getProviders(order?: string, logFailures = true): Provider[] {
  const selected = [...new Set((order ?? process.env.AI_TEXT_PROVIDERS ?? 'groq,cloudflare,openrouter')
    .split(',').map(value => value.trim()).filter(Boolean))];
  const providers: Provider[] = [];

  for (const name of selected) {
    if (!providerNames.has(name as TextProviderName)) {
      if (logFailures) console.warn('[text-ai] Unsupported provider in AI_TEXT_PROVIDERS');
      continue;
    }
    if (name === 'groq') {
      const apiKey = process.env.GROQ_API_SECRET_KEY?.trim();
      if (apiKey) providers.push({
        name: name as TextProviderName, apiKey, baseURL: 'https://api.groq.com/openai/v1',
        model: process.env.GROQ_TEXT_MODEL?.trim() || 'openai/gpt-oss-20b',
      });
    } else if (name === 'cloudflare') {
      const apiKey = process.env.CLOUDFLARE_WORKERS_AI_API_TOKEN?.trim();
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
      if (apiKey && accountId) providers.push({
        name: name as TextProviderName, apiKey,
        baseURL: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1`,
        model: process.env.CLOUDFLARE_TEXT_MODEL?.trim() || '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      });
      else if ((apiKey || accountId) && logFailures) {
        console.warn('[text-ai] Cloudflare Workers AI requires both account ID and API token');
      }
    } else {
      const apiKey = process.env.OPENROUTER_API_SECRET_KEY?.trim();
      const model = process.env.OPENROUTER_TEXT_MODEL?.trim();
      if (apiKey && model) providers.push({
        name: name as TextProviderName, apiKey, baseURL: 'https://openrouter.ai/api/v1',
        model,
      });
      else if (apiKey && logFailures) {
        console.warn('[text-ai] OpenRouter text fallback requires OPENROUTER_TEXT_MODEL ending in :free');
      }
    }
  }
  return providers;
}

function errorDetails(error: unknown): { status?: number; code?: string; type?: string } {
  if (!error || typeof error !== 'object') return {};
  const detail = error as { status?: unknown; code?: unknown; type?: unknown; error?: unknown };
  const nested = detail.error && typeof detail.error === 'object'
    ? detail.error as { code?: unknown; type?: unknown } : {};
  return {
    status: typeof detail.status === 'number' ? detail.status : undefined,
    code: typeof detail.code === 'string' ? detail.code : typeof nested.code === 'string' ? nested.code : undefined,
    type: typeof detail.type === 'string' ? detail.type : typeof nested.type === 'string' ? nested.type : undefined,
  };
}

function isSafetyRejection(error: unknown): boolean {
  const { code, type } = errorDetails(error);
  const safetyCodes = new Set([
    'content_filter', 'content_policy_violation', 'safety', 'safety_violation',
    'safety_blocked', 'moderation_blocked', 'prohibited_content', 'blocklist',
  ]);
  return [code, type].some(value => value && safetyCodes.has(value.toLowerCase()));
}

function isPermanentFailure(error: unknown): boolean {
  const { status } = errorDetails(error);
  return isSafetyRejection(error) ||
    (status !== undefined && status >= 400 && status < 500 && ![408, 409, 429].includes(status));
}

function retryAtFor(error: unknown, now: number): number | null {
  if (error instanceof GroqRateLimitError) return error.retryAt;
  return getGroqRetryAt(error, now, 60_000);
}

function isRateLimited(error: unknown): boolean {
  return error instanceof GroqRateLimitError || errorDetails(error).status === 429;
}

function makeSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const deadlineSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, deadlineSignal]) : deadlineSignal;
}

/**
 * Create a completion adapter with a single deadline shared by every configured provider.
 * The OpenAI-compatible SDK is used for all providers; only Groq receives reasoning options.
 */
export function createTextAI(providerOrder?: string, options: TextAIOptions = {}) {
  const logFailures = options.logFailures !== false;
  const providers = getProviders(providerOrder, logFailures);

  return async (request: CompletionRequest, callOptions: Pick<TextAIOptions, 'budgetMs' | 'signal'> = {}) => {
    const deadlineAt = Date.now() + Math.max(1, callOptions.budgetMs ?? options.budgetMs ?? 25_000);
    const externalSignal = callOptions.signal && options.signal
      ? AbortSignal.any([callOptions.signal, options.signal])
      : callOptions.signal ?? options.signal;
    const signal = makeSignal(externalSignal, Math.max(1, deadlineAt - Date.now()));
    if (externalSignal?.aborted) throw externalSignal.reason;
    if (providers.some(provider => provider.name === 'openrouter' && !provider.model.endsWith(':free'))) {
      throw new TextAIError('configuration', 'OPENROUTER_TEXT_MODEL must be explicitly configured with the :free suffix.', { provider: 'openrouter' });
    }
    if (!providers.length) {
      throw new TextAIError('configuration', 'No configured text AI provider is available. Configure Groq, Cloudflare Workers AI, or OpenRouter.');
    }
    const rateLimitErrors: unknown[] = [];
    const otherErrors: unknown[] = [];

    for (let index = 0; index < providers.length; index++) {
      const provider = providers[index];
      if (signal.aborted) {
        if (externalSignal?.aborted) throw externalSignal.reason;
        throw new TextAIError('timeout', 'Text AI request exceeded its overall time budget.');
      }

      const remainingMs = deadlineAt - Date.now();
      if (remainingMs <= 0) throw new TextAIError('timeout', 'Text AI request exceeded its overall time budget.');
      const groqOnly = providers.length === 1 && provider.name === 'groq';
      const providerTimeout = Math.max(1, Math.min(
        options.providerTimeoutMs ?? (groqOnly ? remainingMs : 8_000),
        Math.floor(remainingMs / (providers.length - index)),
      ));
      const startedAt = Date.now();
      try {
        const client = new OpenAI({
          apiKey: provider.apiKey,
          baseURL: provider.baseURL,
          timeout: providerTimeout,
          maxRetries: 0,
        });
        const invoke = async (invokeOptions: { signal: AbortSignal; timeout: number; maxRetries: 0 }) => {
          const { reasoning_effort, ...commonRequest } = request;
          return client.chat.completions.create({
            ...commonRequest,
            model: provider.model,
            ...(provider.name === 'groq' && reasoning_effort ? { reasoning_effort } : {}),
          }, {
            signal: invokeOptions.signal,
            timeout: Math.min(providerTimeout, invokeOptions.timeout),
          });
        };
        const completion = provider.name === 'groq'
          ? await withGroqRateLimit(provider.model, invoke, {
            budgetMs: providerTimeout,
            signal,
            maxRetries: groqOnly ? undefined : 0,
          })
          : await invoke({ signal, timeout: providerTimeout, maxRetries: 0 });

        const choice = completion.choices?.[0];
        const responseError = ('error' in completion ? completion.error : undefined) ??
          (choice && 'error' in choice ? choice.error : undefined);
        if (responseError) {
          const status = typeof responseError === 'object' && 'code' in responseError &&
            typeof responseError.code === 'number' ? responseError.code : undefined;
          throw Object.assign(new Error('Text AI provider returned an error.'), { status, error: responseError });
        }
        if (choice?.finish_reason === 'content_filter' || choice?.message?.refusal) {
          throw new TextAIError('permanent', 'Text AI provider rejected the request for safety reasons.', { provider: provider.name });
        }
        if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string' || !choice.message.content.trim()) {
          throw new TextAIError('unavailable', 'Text AI provider returned an incomplete or empty response.', { provider: provider.name });
        }
        if (request.response_format?.type === 'json_object' || request.response_format?.type === 'json_schema') {
          try {
            const parsed: unknown = JSON.parse(choice.message.content);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected JSON object');
          } catch {
            throw new TextAIError('unavailable', 'Text AI provider returned invalid JSON.', { provider: provider.name });
          }
        }
        return completion;
      } catch (error) {
        if (externalSignal?.aborted) throw externalSignal.reason;
        if (signal.aborted && Date.now() >= deadlineAt) {
          throw new TextAIError('timeout', 'Text AI request exceeded its overall time budget.', { provider: provider.name });
        }
        if (error instanceof TextAIError && error.kind === 'permanent') throw error;
        if (isPermanentFailure(error)) {
          const { status } = errorDetails(error);
          throw new TextAIError('permanent', 'Text AI provider rejected the request; check credentials, model, input, or safety policy.', {
            provider: provider.name, status,
          });
        }
        if (isRateLimited(error)) rateLimitErrors.push(error);
        else otherErrors.push(error);

        const { status } = errorDetails(error);
        if (logFailures) console.warn('[text-ai] Provider unavailable; trying configured fallback', {
          provider: provider.name, status: status ?? null, elapsedMs: Date.now() - startedAt,
        });
      }
    }

    if (rateLimitErrors.length && !otherErrors.length && rateLimitErrors.length === providers.length) {
      const retryAt = Math.max(...rateLimitErrors.map(error => retryAtFor(error, Date.now()) ?? Date.now() + 60_000));
      throw new GroqRateLimitError(
        retryAt,
        undefined,
        'Quota dei provider AI temporaneamente esaurita: elaborazione rinviata.',
      );
    }
    throw new TextAIError('unavailable', 'All configured text AI providers failed; retry the request later.');
  };
}
