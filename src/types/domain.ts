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

export type ChatMode = 'single' | 'compare';

/** 'image' chats send the composer prompt to an image model instead of a chat model. */
export type ChatKind = 'chat' | 'image';

/** Last-used image settings. Null means the model's own default. */
export interface ImageOptions {
  aspectRatio: string | null;
  resolution: string | null;
  quality: string | null;
  count: number;
}

export interface Lane {
  modelId: string;
  thinking: ThinkingLevel;
}

export interface Chat {
  id: string;
  title: string;
  titleSource: TitleSource;
  /** Lane 0's model and thinking, kept for everything that assumes one model per chat. */
  modelId: string;
  thinking: ThinkingLevel;
  mode: ChatMode;
  /** Present for compare chats. */
  lanes: Lane[] | null;
  /** What the composer sends next; the sidebar marks image chats. */
  kind: ChatKind;
  /** Image model for image turns. Null until the chat first switches to images. */
  imageModelId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  /** Counts of OpenRouter server-tool calls made while producing the reply. */
  server_tool_use_details?: { web_search_requests?: number; [k: string]: unknown };
  [k: string]: unknown;
}

/** A web page the reply cited, from OpenRouter's url_citation annotations. */
export interface Citation {
  url: string;
  title: string | null;
}

export type AttachmentKind = 'image' | 'pdf' | 'text';

export interface Attachment {
  id: string;
  messageId: string;
  chatId: string;
  kind: AttachmentKind;
  name: string;
  mime: string;
  size: number;
  /** Path under the app data directory, e.g. attachments/<chatId>/<id>.png */
  relPath: string;
  width: number | null;
  height: number | null;
  /** Text kind: the file contents, inlined into the prompt. */
  textContent: string | null;
  /** PDF kind: OpenRouter's parsed-file annotation, reused on later turns to skip re-parsing. */
  annotation: unknown;
  createdAt: number;
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
  /** Compare mode: which column this reply belongs to. Null for user messages and single-mode replies. */
  lane: number | null;
  /** Client-measured latency, ms from request start. */
  firstTokenMs: number | null;
  totalMs: number | null;
  createdAt: number;
  /** Only true for the in-memory placeholder while a reply streams. */
  streaming?: boolean;
  /** Set when the request failed; shown under the bubble. */
  error?: string;
  attachments?: Attachment[];
  /** Assistant replies that used web search or fetch: the sources they cited. */
  citations?: Citation[];
  /** Only on the in-memory placeholder while images generate: how many tiles to show. */
  pendingImages?: number;
}

export interface SearchResult {
  chatId: string;
  title: string;
  snippet: string | null;
}
