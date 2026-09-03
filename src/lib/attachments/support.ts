import type { OpenRouterModel, PdfEngine } from '@/lib/openrouter/types';
import type { AttachmentKind } from '@/types/domain';

export function acceptsImages(model: OpenRouterModel | undefined): boolean {
  return model?.architecture?.input_modalities?.includes('image') ?? false;
}

export function acceptsFiles(model: OpenRouterModel | undefined): boolean {
  return model?.architecture?.input_modalities?.includes('file') ?? false;
}

export interface SupportIssue {
  kind: AttachmentKind;
  /** 'block' disables send; 'note' is informational. */
  level: 'block' | 'note';
  message: string;
}

/**
 * Text is always fine (inlined). Images need a vision model. PDFs are fine everywhere because
 * OpenRouter can parse them to text, but on a model without native file support that is worth
 * flagging since layout and figures are lost.
 */
export function supportIssues(
  kinds: AttachmentKind[],
  model: OpenRouterModel | undefined,
  modelName: string,
): SupportIssue[] {
  const issues: SupportIssue[] = [];
  const unique = new Set(kinds);
  if (unique.has('image') && !acceptsImages(model)) {
    issues.push({ kind: 'image', level: 'block', message: `${modelName} can't read images.` });
  }
  if (unique.has('pdf') && !acceptsFiles(model)) {
    issues.push({
      kind: 'pdf',
      level: 'note',
      message: `${modelName} can't read PDFs directly; OpenRouter will convert it to text first.`,
    });
  }
  return issues;
}

export function pdfEngineFor(model: OpenRouterModel | undefined, ocr: boolean): PdfEngine {
  if (ocr) return 'mistral-ocr';
  return acceptsFiles(model) ? 'native' : 'cloudflare-ai';
}
