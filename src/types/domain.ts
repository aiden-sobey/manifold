export const THINKING_LEVELS = [
  'default',
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export type TitleSource = 'fallback' | 'auto' | 'manual';
export type Role = 'user' | 'assistant';
export type FinishReason =
  'stop' | 'length' | 'error' | 'aborted' | 'content_filter' | 'tool_calls';

export interface Chat {
  id: string;
  title: string;
  titleSource: TitleSource;
  modelId: string;
  thinking: ThinkingLevel;
  createdAt: number;
  updatedAt: number;
}

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  [k: string]: unknown;
}

export interface Message {
  id: string;
  chatId: string;
  role: Role;
  content: string;
  reasoning: string | null;
  modelId: string | null;
  finishReason: FinishReason | null;
  usage: Usage | null;
  createdAt: number;
  /** Only true for the in-memory placeholder while a reply streams. */
  streaming?: boolean;
  /** Set when the request failed; shown under the bubble. */
  error?: string;
}

export interface SearchResult {
  chatId: string;
  title: string;
  snippet: string | null;
}
