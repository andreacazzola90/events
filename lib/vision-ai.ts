import OpenAI from 'openai';

type VisionProvider = 'groq' | 'gemini' | 'openrouter';

export class VisionServiceUnavailableError extends Error {
  constructor() {
    super('Il servizio di controllo immagini non e al momento disponibile. Riprova tra poco o verifica quota e configurazione dei servizi AI. Non e necessario ritagliare di nuovo la locandina.');
    this.name = 'VisionServiceUnavailableError';
  }
}

function getVisionProviders() {
  const order = [...new Set((process.env.AI_VISION_PROVIDERS ?? 'groq,gemini,openrouter')
    .split(',').map(value => value.trim()).filter(Boolean))];
  const settings = {
    groq: {
      apiKey: process.env.GROQ_API_SECRET_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
      model: process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b',
    },
    gemini: {
      apiKey: process.env.GEMINI_API_SECRET_KEY,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      model: process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash',
    },
    openrouter: {
      apiKey: process.env.OPENROUTER_API_SECRET_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      model: process.env.OPENROUTER_VISION_MODEL?.trim() || '',
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

export function createEventImageAnalyzer() {
  const providers = getVisionProviders();
  const unavailable = new Set<string>();

  return async (imageUrl: string, prompt: string): Promise<string> => {
    const deadline = Date.now() + 20_000;
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
      if (remaining <= 0) break;
      try {
        const client = new OpenAI({
          apiKey: provider.apiKey,
          baseURL: provider.baseURL,
          timeout: Math.min(7_000, remaining),
          maxRetries: 0,
        });
        const completion = await client.chat.completions.create({
          model: provider.model,
          messages,
          temperature: 0.1,
          max_tokens: 2000,
        });
        if ('error' in completion && completion.error) throw completion.error;
        const choice = completion.choices?.[0];
        if (choice && 'error' in choice && choice.error) throw choice.error;
        if (deadline <= Date.now()) throw new VisionServiceUnavailableError();
        if (choice?.finish_reason !== 'stop' || choice.message?.refusal) return '';
        return typeof choice.message?.content === 'string' ? choice.message.content : '';
      } catch (error) {
        if (isSafetyRejection(error)) return '';
        unavailable.add(provider.name);
        console.warn('[vision-ai] Provider unavailable:', provider.name);
      }
    }

    throw new VisionServiceUnavailableError();
  };
}

export async function analyzeEventImage(imageUrl: string, prompt: string): Promise<string> {
  return createEventImageAnalyzer()(imageUrl, prompt);
}