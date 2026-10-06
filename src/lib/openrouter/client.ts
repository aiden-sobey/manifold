import { readSSE } from './sse';
import type {
  ChatCompletionRequest,
  CompletionResponse,
  OpenRouterModel,
  StreamEvent,
} from './types';

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

export class OpenRouterError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string | number,
  ) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

function headers(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://github.com/aiden/manifold',
    'X-Title': 'Manifold',
  };
}

export function friendlyHttpError(status: number, body?: string): string {
  switch (status) {
    case 401:
      return 'OpenRouter rejected the API key. Open Settings and check it.';
    case 402:
      return 'Out of OpenRouter credits.';
    case 429:
      return 'Rate limited by OpenRouter. Try again in a moment.';
    default: {
      let detail = '';
      if (body) {
        try {
          const parsed = JSON.parse(body) as { error?: { message?: string } };
          detail = parsed.error?.message ?? '';
        } catch {
          detail = body.slice(0, 200);
        }
      }
      return `OpenRouter request failed (${status})${detail ? `: ${detail}` : ''}`;
    }
  }
}

export async function* streamChat(
  apiKey: string,
  request: ChatCompletionRequest,
  signal: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ ...request, stream: true }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new OpenRouterError(friendlyHttpError(res.status, text), res.status);
  }
  if (!res.body) throw new OpenRouterError('OpenRouter returned an empty body');

  yield* readSSE(res.body, signal);
}

export async function completeOnce(
  apiKey: string,
  request: ChatCompletionRequest,
  signal?: AbortSignal,
): Promise<CompletionResponse> {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ ...request, stream: false }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new OpenRouterError(friendlyHttpError(res.status, text), res.status);
  }
  return (await res.json()) as CompletionResponse;
}

export async function listModels(): Promise<OpenRouterModel[]> {
  const res = await fetch(`${OPENROUTER_BASE}/models`);
  if (!res.ok) throw new OpenRouterError(friendlyHttpError(res.status), res.status);
  const json = (await res.json()) as { data: OpenRouterModel[] };
  return json.data;
}

export async function listTranscriptionModels(): Promise<OpenRouterModel[]> {
  const res = await fetch(`${OPENROUTER_BASE}/models?output_modalities=transcription`);
  if (!res.ok) throw new OpenRouterError(friendlyHttpError(res.status), res.status);
  const json = (await res.json()) as { data: OpenRouterModel[] };
  return json.data;
}

export interface TranscriptionResult {
  text: string;
  modelId: string;
  usage: Record<string, unknown>;
}

function numericUsage(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export async function transcribeAudio(
  apiKey: string,
  model: string,
  audio: Blob,
  format: string,
  signal?: AbortSignal,
): Promise<TranscriptionResult> {
  const bytes = new Uint8Array(await audio.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const data = btoa(binary);
  const res = await fetch(`${OPENROUTER_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ model, input_audio: { data, format } }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new OpenRouterError(friendlyHttpError(res.status, text), res.status);
  }

  const json = (await res.json()) as { text?: unknown; model?: unknown; usage?: unknown };
  if (typeof json.text !== 'string') throw new OpenRouterError('OpenRouter returned no transcript');
  const usage: Record<string, unknown> =
    json.usage && typeof json.usage === 'object' ? { ...json.usage } : {};
  if (usage.prompt_tokens === undefined && numericUsage(usage.input_tokens)) {
    usage.prompt_tokens = usage.input_tokens;
  }
  if (usage.completion_tokens === undefined && numericUsage(usage.output_tokens)) {
    usage.completion_tokens = usage.output_tokens;
  }
  if (!numericUsage(usage.cost)) delete usage.cost;
  return { text: json.text, modelId: typeof json.model === 'string' ? json.model : model, usage };
}

export interface KeyInfo {
  label?: string;
  usage?: number;
  limit?: number | null;
  limit_remaining?: number | null;
  is_free_tier?: boolean;
}

export async function checkApiKey(apiKey: string): Promise<KeyInfo> {
  const res = await fetch(`${OPENROUTER_BASE}/key`, { headers: headers(apiKey) });
  if (!res.ok) throw new OpenRouterError(friendlyHttpError(res.status), res.status);
  const json = (await res.json()) as { data?: KeyInfo };
  return json.data ?? {};
}

export interface Credits {
  total_credits: number;
  total_usage: number;
}

/** Account balance. Requires a management key; a regular key gets 403. */
export async function getCredits(managementKey: string): Promise<Credits> {
  const res = await fetch(`${OPENROUTER_BASE}/credits`, { headers: headers(managementKey) });
  if (res.status === 403) {
    throw new OpenRouterError(
      'This is not a management key. Create one at openrouter.ai/settings/keys.',
      403,
    );
  }
  if (!res.ok) throw new OpenRouterError(friendlyHttpError(res.status), res.status);
  const json = (await res.json()) as { data?: Credits };
  if (!json.data) throw new OpenRouterError('Unexpected credits response');
  return json.data;
}
