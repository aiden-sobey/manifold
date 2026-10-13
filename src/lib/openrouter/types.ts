export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } };

export interface FileAnnotation {
  type: 'file';
  file: { hash?: string; name?: string; content?: unknown };
  [k: string]: unknown;
}

/** A web source the reply drew on. Some providers flatten the fields onto the annotation itself. */
export interface UrlCitationAnnotation {
  type: 'url_citation';
  url_citation?: { url?: string; title?: string; content?: string };
  url?: string;
  title?: string;
}

export type Annotation = FileAnnotation | UrlCitationAnnotation;

export interface ChatMessageParam {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
  /** Returned by OpenRouter after parsing a PDF; echo back on later turns to skip re-parsing. */
  annotations?: FileAnnotation[];
}

export type PdfEngine = 'native' | 'cloudflare-ai' | 'mistral-ocr';

export interface FileParserPlugin {
  id: 'file-parser';
  pdf: { engine: PdfEngine };
}

export interface ReasoningParam {
  effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  max_tokens?: number;
  exclude?: boolean;
  enabled?: boolean;
}

/** Tools OpenRouter runs on its own servers; the model decides when to call them. */
export type ServerTool =
  | {
      type: 'openrouter:web_search';
      parameters?: {
        engine?: 'auto' | 'native' | 'exa' | 'parallel' | 'perplexity' | 'firecrawl';
        mode?: string;
        max_results?: number;
        max_uses?: number;
      };
    }
  | {
      type: 'openrouter:web_fetch';
      parameters?: { max_uses?: number; max_content_tokens?: number };
    };

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessageParam[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  reasoning?: ReasoningParam;
  plugins?: FileParserPlugin[];
  tools?: ServerTool[];
  /** Cap on server-tool steps across all tools in one request. OpenRouter's default is 30. */
  max_tool_calls?: number;
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
      annotations?: Annotation[];
    };
    message?: { annotations?: Annotation[] };
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
  | { type: 'annotations'; annotations: Annotation[] }
  | { type: 'error'; code?: string | number; message: string }
  | { type: 'done'; finishReason: string | null };

export type ImageParamSpec =
  | { type: 'enum'; values: string[] }
  | { type: 'range'; min: number; max: number }
  | { type: 'boolean' };

/** An entry in OpenRouter's image catalog (/images/models). */
export interface ImageModel {
  id: string;
  name: string;
  description?: string;
  created?: number;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  supported_parameters?: Partial<Record<string, ImageParamSpec>>;
  supports_streaming?: boolean;
}

export interface ImagePriceLine {
  /** 'output_image' | 'input_image' | 'input_text' | … */
  billable: string;
  /** 'image' | 'megapixel' | 'token' */
  unit: string;
  cost_usd: number;
  /** The resolution and/or quality this price applies to, e.g. '2k' or 'medium_1k'. */
  variant?: string;
}

export interface ImageRequest {
  model: string;
  prompt: string;
  n?: number;
  aspect_ratio?: string;
  resolution?: string;
  quality?: string;
  /** Images to edit or take style from, as data URLs. */
  input_references?: Array<{ type: 'image_url'; image_url: { url: string } }>;
}

export interface ImageResponse {
  data?: Array<{ b64_json?: string; media_type?: string }>;
  usage?: Record<string, unknown>;
}
