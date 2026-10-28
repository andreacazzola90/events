import OpenAI from 'openai';

type VisionProvider = 'nvidia' | 'gemini' | 'openrouter' | 'groq';

const nvidiaCoordinate = { type: ['number', 'null'], minimum: 0, maximum: 1 };
const nvidiaCropResponseFormat = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'poster_crop', strict: true,
    schema: {
      type: 'object', additionalProperties: false,
      properties: {
        x: nvidiaCoordinate, y: nvidiaCoordinate, width: nvidiaCoordinate, height: nvidiaCoordinate,
        socialHeaderBottom: nvidiaCoordinate, socialFooterTop: nvidiaCoordinate,
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        safe: { type: ['boolean', 'null'] },
      },
      required: ['x', 'y', 'width', 'height', 'socialHeaderBottom', 'socialFooterTop', 'confidence', 'safe'],
    },
  },
};

export class VisionServiceUnavailableError extends Error {
  readonly reason: 'unavailable' | 'rate-limited' | 'timeout' | 'not-configured';

  constructor(reason: VisionServiceUnavailableError['reason'] = 'unavailable') {
    super('Il servizio vision non e al momento disponibile. Riprova tra poco o verifica quota e configurazione. Non e necessario ricaricare o ritagliare il file.');
    this.name = 'VisionServiceUnavailableError';
    this.reason = reason;
  }
}

function getVisionProviders(providerOrder?: string) {
  const order = [...new Set((providerOrder ?? process.env.AI_VISION_PROVIDERS ?? 'nvidia,groq')
    .split(',').map(value => value.trim()).filter(Boolean))];
  const settings = {
    nvidia: {
      apiKey: process.env.NVIDIA_API_SECRET_KEY,
      baseURL: 'https://integrate.api.nvidia.com/v1',
      model: process.env.NVIDIA_VISION_MODEL?.trim() || 'nvidia/nemotron-3.5-super-vl-120b-a12b',
    },
    gemini: {
      apiKey: process.env.GEMINI_API_SECRET_KEY,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      model: process.env.GEMINI_VISION_MODEL?.trim() || 'gemini-3.8-flash',
    },
    openrouter: {
      apiKey: process.env.OPENROUTER_API_SECRET_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      model: process.env.OPENROUTER_VISION_MODEL?.trim() || '',
    },
    groq: {
      apiKey: process.env.GROQ_API_SECRET_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
      model: process.env.GROQ_VISION_MODEL?.trim() || 'qwen/qwen3.8-27b',
    },
  };

  return order.flatMap(name => {
    if (!Object.hasOwn(settings, name)) {
      console.warn('[vision-ai] Unsupported provider in AI_VISION_PROVIDERS');
      return [];
    }
    const config = settings[name as VisionProvider];
    if (!config.apiKey?.trim()) return [];
    if (name === 'openrouter' && !config.model.endsWith(':free')) {
      console.warn('[vision-ai] OpenRouter requires a multimodal OPENROUTER_VISION_MODEL ending in :free');
      return [];
    }
    return [{ name, ...config, apiKey: config.apiKey.trim() }];
  });
}

function isSafetyRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const nested = 'error' in error ? error.error : undefined;
  const codes = new Set(['content_filter', 'content_policy_violation', 'safety', 'safety_violation',
    'safety_blocked', 'moderation_blocked', 'prohibited_content', 'blocklist', 'image_safety']);
  return [error, nested].some(value => {
    if (!value || typeof value !== 'object') return false;
    const detail = value as { code?: unknown; type?: unknown };
    return [detail.code, detail.type].some(code => typeof code === 'string' && codes.has(code.toLowerCase()));
  });
}

export function createEventImageAnalyzer(providerOrder?: string, options: {
  budgetMs?: number;
  signal?: AbortSignal;
  jsonMode?: boolean;
  retryRateLimit?: boolean;
  onProviderFailure?: (provider: string, status?: number) => void;
} = {}) {
  const providers = getVisionProviders(providerOrder);
  const unavailable = new Set<string>();
  let failureReason: VisionServiceUnavailableError['reason'] = providers.length ? 'unavailable' : 'not-configured';
  let rateLimitRetried = false;
  const deadline = Date.now() + (options.budgetMs ?? 180_000);

  return async (imageUrl: string, prompt: string): Promise<string> => {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageUrl } },
        { type: 'text', text: prompt },
      ],
    }];

    for (const provider of providers) {
      if (unavailable.has(provider.name)) continue;
      const remaining = deadline - Date.now();
      if (remaining <= 0 || options.signal?.aborted) {
        failureReason = 'timeout';
        break;
      }
      const startedAt = Date.now();
      const timeout = Math.min(60_000, remaining);
      try {
        const client = new OpenAI({
          apiKey: provider.apiKey,
          baseURL: provider.baseURL,
          timeout,
          maxRetries: 0,
        });
        const invoke = () => client.chat.completions.create({
          model: provider.model,
          messages: options.jsonMode && provider.name === 'nvidia' ? [{
            role: 'system' as const,
            content: 'Return only valid JSON matching the schema. Coordinates and confidence are decimal fractions on 0..1, never pixels, percentages or 0..1000. Example confidence:0.95 and x:0.05. For privacy verdicts return safe and confidence; all coordinates are null. For bounds set safe to null. If no bounds are found, set coordinates to null and confidence to zero. Absent header/footer values stay null.',
          }, ...messages] : messages,
          temperature: 0.1,
          max_tokens: options.jsonMode && provider.name === 'groq' ? 512 : 2000,
          ...(options.jsonMode ? { response_format: provider.name === 'nvidia' ? nvidiaCropResponseFormat : { type: 'json_object' as const } } : {}),
          ...(options.jsonMode && provider.name === 'nvidia' ? { chat_template_kwargs: { enable_thinking: false } } : {}),
          ...(provider.name === 'gemini' ? { reasoning_effort: 'low' as const } : {}),
        }, { signal: options.signal, timeout: Math.min(60_000, Math.max(1, deadline - Date.now())) });
        let completion;
        try {
          completion = await invoke();
        } catch (error) {
          const detail = error as { status?: number; headers?: { get?: (name: string) => string | null; 'retry-after'?: string } } | null;
          const header = typeof detail?.headers?.get === 'function' ? detail.headers.get('retry-after') : detail?.headers?.['retry-after'];
          const delay = typeof header === 'string' && header.trim() ? Number(header) * 1000 + 150 : NaN;
          if (!options.retryRateLimit || provider.name !== 'groq' || rateLimitRetried || detail?.status !== 429 ||
            !Number.isFinite(delay) || delay < 150 || delay > 20_000 || deadline - Date.now() < delay + 2_000) throw error;
          rateLimitRetried = true;
          console.warn('[vision-ai] Free quota temporarily busy; retrying Groq once after Retry-After');
          await new Promise<void>((resolve, reject) => {
            const abort = () => {
              clearTimeout(timer);
              options.signal?.removeEventListener('abort', abort);
              reject(new VisionServiceUnavailableError('timeout'));
            };
            const timer = setTimeout(() => {
              options.signal?.removeEventListener('abort', abort);
              resolve();
            }, delay);
            options.signal?.addEventListener('abort', abort, { once: true });
            if (options.signal?.aborted) abort();
          });
          completion = await invoke();
        }
        if ('error' in completion && completion.error) throw completion.error;
        const choice = completion.choices?.[0];
        if (choice && 'error' in choice && choice.error) throw choice.error;
        if (deadline <= Date.now()) throw new VisionServiceUnavailableError('timeout');
        if (choice?.finish_reason === 'length') {
          unavailable.add(provider.name);
          console.warn('[vision-ai] Provider response was truncated:', provider.name);
          continue;
        }
        if (choice?.finish_reason !== 'stop' || choice.message?.refusal) return '';
        return typeof choice.message?.content === 'string' ? choice.message.content : '';
      } catch (error) {
        if (error instanceof VisionServiceUnavailableError) throw error;
        if (isSafetyRejection(error)) return '';
        unavailable.add(provider.name);
        const detail = error && typeof error === 'object' ? error as { status?: unknown; code?: unknown } : {};
        failureReason = detail.status === 429 ? 'rate-limited' : options.signal?.aborted ? 'timeout' : 'unavailable';
        options.onProviderFailure?.(provider.name, typeof detail.status === 'number' ? detail.status : undefined);
        console.warn('[vision-ai] Provider unavailable:', provider.name, {
          elapsedMs: Date.now() - startedAt,
          timeoutMs: timeout,
          status: detail.status ?? null,
          code: detail.code ?? null,
          message: (error instanceof Error ? error.message : String(error)).slice(0, 200),
        });
      }
    }

    throw new VisionServiceUnavailableError(failureReason);
  };
}

export async function analyzeEventImage(imageUrl: string, prompt: string): Promise<string> {
  return createEventImageAnalyzer()(imageUrl, prompt);
}