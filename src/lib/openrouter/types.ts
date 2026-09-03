export interface ChatMessageParam {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ReasoningParam {
  effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  max_tokens?: number;
  exclude?: boolean;
  enabled?: boolean;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessageParam[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  reasoning?: ReasoningParam;
}

export interface ReasoningDetail {
  /** 'reasoning.text' | 'reasoning.summary' | 'reasoning.encrypted' | future types */
  type: string;
  text?: string;
  summary?: string;
  id?: string;
  format?: string;
}

export interface StreamChunk {
  id?: string;
  model?: string;
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning?: string | null;
      reasoning_details?: ReasoningDetail[];
    };
    finish_reason?: string | null;
  }>;
  usage?: Record<string, unknown>;
  error?: { code?: string | number; message?: string };
}

export interface CompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    message: { role: string; content: string | null; reasoning?: string | null };
    finish_reason: string | null;
  }>;
  usage?: Record<string, unknown>;
}

export interface ModelReasoning {
  mandatory?: boolean;
  supported_efforts?: string[];
  default_effort?: string;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  supported_parameters?: string[];
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  reasoning?: ModelReasoning | null;
  created?: number;
}

export type StreamEvent =
  | { type: 'content'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'usage'; usage: Record<string, unknown> }
  | { type: 'error'; code?: string | number; message: string }
  | { type: 'done'; finishReason: string | null };
