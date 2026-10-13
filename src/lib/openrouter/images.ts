import type { SupportIssue } from '@/lib/attachments/support';
import type { CostInfo } from '@/lib/cost';
import type { AttachmentKind, ImageOptions } from '@/types/domain';
import type {
  ImageModel,
  ImageParamSpec,
  ImagePriceLine,
  ImageRequest,
  ImageResponse,
} from './types';

/** Images per request the composer offers, even when a model allows more. Keeps a misclick cheap. */
export const MAX_IMAGE_COUNT = 4;

function enumValues(spec: ImageParamSpec | undefined): string[] {
  return spec?.type === 'enum' ? spec.values : [];
}

function rangeMax(spec: ImageParamSpec | undefined): number {
  return spec?.type === 'range' ? spec.max : 0;
}

/** What the composer can offer for this model, from its catalog entry. Empty lists hide a control. */
export function imageControls(model: ImageModel | undefined) {
  const p = model?.supported_parameters ?? {};
  return {
    aspectRatios: enumValues(p.aspect_ratio),
    resolutions: enumValues(p.resolution),
    qualities: enumValues(p.quality),
    maxCount: Math.max(1, Math.min(MAX_IMAGE_COUNT, rangeMax(p.n))),
    maxReferences: rangeMax(p.input_references),
  };
}

/** The saved options this model accepts. Anything it doesn't offer falls back to its default. */
export function effectiveImageOptions(
  model: ImageModel | undefined,
  saved: ImageOptions,
): ImageOptions {
  const c = imageControls(model);
  const pick = (v: string | null, allowed: string[]) => (v && allowed.includes(v) ? v : null);
  return {
    aspectRatio: pick(saved.aspectRatio, c.aspectRatios),
    resolution: pick(saved.resolution, c.resolutions),
    quality: pick(saved.quality, c.qualities),
    count: Math.min(Math.max(1, saved.count), c.maxCount),
  };
}

/** Request fields for these options; defaults are left out so the provider picks. */
export function imageRequestOptions(
  model: ImageModel | undefined,
  saved: ImageOptions,
): Pick<ImageRequest, 'n' | 'aspect_ratio' | 'resolution' | 'quality'> {
  const o = effectiveImageOptions(model, saved);
  return {
    ...(o.count > 1 ? { n: o.count } : {}),
    ...(o.aspectRatio ? { aspect_ratio: o.aspectRatio } : {}),
    ...(o.resolution ? { resolution: o.resolution } : {}),
    ...(o.quality ? { quality: o.quality } : {}),
  };
}

const EDGE_PX: Record<string, number> = {
  '512': 512,
  '768': 768,
  '1k': 1024,
  '1.5k': 1536,
  '2k': 2048,
  '4k': 4096,
};

/** Rough output tokens per image for token-priced models: OpenAI's figures by quality, else Gemini's. */
const TOKENS_BY_QUALITY: Record<string, number> = { low: 272, medium: 1056, high: 4160 };

/**
 * Price of one output image with these options, or null when the model publishes no output price.
 * Not exact when it depends on what we can only guess: output tokens or the exact pixel size.
 */
export function estimateImageCost(
  lines: ImagePriceLine[],
  options: Pick<ImageOptions, 'resolution' | 'quality'>,
): CostInfo | null {
  const out = lines.filter((l) => l.billable === 'output_image' && Number.isFinite(l.cost_usd));
  if (out.length === 0) return null;
  const res = (options.resolution ?? '1K').toLowerCase();
  const quality = options.quality?.toLowerCase() ?? null;
  // Prices can vary by resolution, quality or both ('2k', 'medium', 'medium_1k').
  const keys = [quality ? `${quality}_${res}` : null, res, quality].filter(Boolean);
  const matched = out.find((l) => l.variant && keys.includes(l.variant.toLowerCase()));
  const line = matched ?? out.find((l) => !l.variant) ?? out[0]!;
  const exactVariant = !line.variant || line === matched;
  const edge = EDGE_PX[res] ?? 1024;

  switch (line.unit) {
    case 'image':
      return { cost: line.cost_usd, exact: exactVariant };
    case 'megapixel':
      return { cost: (line.cost_usd * edge * edge) / 1_000_000, exact: false };
    case 'token': {
      const tokens = (quality && TOKENS_BY_QUALITY[quality]) || (edge >= 4096 ? 2000 : 1300);
      return { cost: line.cost_usd * tokens, exact: false };
    }
    default:
      return null;
  }
}

export interface GeneratedImage {
  bytes: Uint8Array;
  mime: string;
}

function sniffMime(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45) {
    return 'image/webp';
  }
  if (bytes[0] === 0x3c) return 'image/svg+xml';
  return 'image/png';
}

/** Decodes the base64 images in an Image API response. */
export function decodeImages(res: ImageResponse): GeneratedImage[] {
  return (res.data ?? []).flatMap((d) => {
    if (!d.b64_json) return [];
    const binary = atob(d.b64_json);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return [{ bytes, mime: d.media_type || sniffMime(bytes) }];
  });
}

export function imageExtension(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/svg+xml') return 'svg';
  return mime.startsWith('image/') ? mime.slice(6) : 'png';
}

/** "A fox in the snow, oil painting" → "a-fox-in-the-snow-oil-painting-2.png" */
export function imageFileName(prompt: string, index: number, ext: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
  return `${slug || 'image'}-${index + 1}.${ext}`;
}

/** Attachments an image model can't take: anything but images, or more images than it accepts. */
export function imageSupportIssues(
  kinds: AttachmentKind[],
  model: ImageModel | undefined,
  modelName: string,
): SupportIssue[] {
  const issues: SupportIssue[] = [];
  for (const kind of new Set(kinds)) {
    if (kind === 'image') continue;
    issues.push({ kind, level: 'block', message: 'Image models only take images as references.' });
  }
  const images = kinds.filter((k) => k === 'image').length;
  const max = imageControls(model).maxReferences;
  if (images > 0 && max === 0) {
    issues.push({ kind: 'image', level: 'block', message: `${modelName} can't edit images.` });
  } else if (images > max) {
    issues.push({
      kind: 'image',
      level: 'block',
      message: `${modelName} takes at most ${max} reference image${max === 1 ? '' : 's'}.`,
    });
  }
  return issues;
}
