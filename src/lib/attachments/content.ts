import type {
  ChatMessageParam,
  ContentPart,
  FileAnnotation,
  FileParserPlugin,
  OpenRouterModel,
} from '@/lib/openrouter/types';
import type { Attachment, Message } from '@/types/domain';
import { languageOf } from './kinds';
import { pdfEngineFor } from './support';

export type BytesLoader = (a: Attachment) => Promise<Uint8Array>;

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function dataUrl(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${toBase64(bytes)}`;
}

/** Inlined text attachment: fenced block with a language hint and the filename. */
export function textAttachmentBlock(a: Pick<Attachment, 'name' | 'textContent'>): string {
  const body = (a.textContent ?? '').replace(/\r\n/g, '\n');
  // Choose a fence longer than any run of backticks in the content.
  const longest = Math.max(2, ...[...body.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}${languageOf(a.name)} title="${a.name}"\n${body}\n${fence}`;
}

/** Builds the OpenRouter content for a user message. Plain string when there are no attachments. */
export async function buildUserContent(
  message: Pick<Message, 'content' | 'attachments'>,
  bytesFor: BytesLoader,
): Promise<string | ContentPart[]> {
  const atts = message.attachments ?? [];
  if (atts.length === 0) return message.content;

  const parts: ContentPart[] = [];
  for (const a of atts) {
    if (a.kind === 'text') parts.push({ type: 'text', text: textAttachmentBlock(a) });
  }
  for (const a of atts) {
    if (a.kind === 'image') {
      parts.push({ type: 'image_url', image_url: { url: dataUrl(a.mime, await bytesFor(a)) } });
    } else if (a.kind === 'pdf') {
      parts.push({
        type: 'file',
        file: { filename: a.name, file_data: dataUrl('application/pdf', await bytesFor(a)) },
      });
    }
  }
  if (message.content.trim()) parts.push({ type: 'text', text: message.content });
  return parts;
}

/** Annotations from PDFs on the user message, to echo on the following assistant turn. */
export function annotationsFor(message: Pick<Message, 'attachments'>): FileAnnotation[] {
  return (message.attachments ?? [])
    .filter((a) => a.kind === 'pdf' && a.annotation)
    .map((a) => a.annotation as FileAnnotation);
}

export function hasPdf(messages: Array<Pick<Message, 'attachments'>>): boolean {
  return messages.some((m) => m.attachments?.some((a) => a.kind === 'pdf'));
}

export function pluginsFor(
  messages: Array<Pick<Message, 'attachments'>>,
  model: OpenRouterModel | undefined,
  ocr: boolean,
): FileParserPlugin[] | undefined {
  if (!hasPdf(messages)) return undefined;
  return [{ id: 'file-parser', pdf: { engine: pdfEngineFor(model, ocr) } }];
}

/**
 * Converts stored messages into request messages: multipart user turns, assistant turns
 * carrying PDF annotations from the preceding user turn.
 */
export async function buildHistory(
  messages: Message[],
  bytesFor: BytesLoader,
): Promise<ChatMessageParam[]> {
  const out: ChatMessageParam[] = [];
  let pendingAnnotations: FileAnnotation[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: await buildUserContent(m, bytesFor) });
      pendingAnnotations = annotationsFor(m);
    } else {
      const param: ChatMessageParam = { role: 'assistant', content: m.content };
      if (pendingAnnotations.length) param.annotations = pendingAnnotations;
      pendingAnnotations = [];
      out.push(param);
    }
  }
  return out;
}
