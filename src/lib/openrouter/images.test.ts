import type { ImageOptions } from '@/types/domain';
import {
  decodeImages,
  effectiveImageOptions,
  estimateImageCost,
  imageControls,
  imageExtension,
  imageFileName,
  imageRequestOptions,
  imageSupportIssues,
} from './images';
import type { ImageModel } from './types';

// Trimmed from OpenRouter's /images/models catalog.
const nanoBanana: ImageModel = {
  id: 'google/gemini-nano-banana-2.1',
  name: 'Google: Nano Banana 2.1',
  supported_parameters: {
    resolution: { type: 'enum', values: ['1K', '2K', '4K'] },
    aspect_ratio: { type: 'enum', values: ['1:1', '16:9', '9:16'] },
    n: { type: 'range', min: 1, max: 1 },
    input_references: { type: 'range', min: 0, max: 14 },
  },
};
const gptImage: ImageModel = {
  id: 'openai/gpt-image-2',
  name: 'OpenAI: GPT Image 2',
  supported_parameters: {
    aspect_ratio: { type: 'enum', values: ['1:1', '3:2', 'auto'] },
    quality: { type: 'enum', values: ['auto', 'low', 'medium', 'high'] },
    n: { type: 'range', min: 1, max: 10 },
    input_references: { type: 'range', min: 0, max: 16 },
  },
};
const noOptions: ImageModel = { id: 'meta/muse-image', name: 'Meta: Muse Image' };

const opts = (over: Partial<ImageOptions> = {}): ImageOptions => ({
  aspectRatio: null,
  resolution: null,
  quality: null,
  count: 1,
  ...over,
});

describe('imageControls', () => {
  it('reads options from the catalog and caps the count', () => {
    expect(imageControls(nanoBanana)).toEqual({
      aspectRatios: ['1:1', '16:9', '9:16'],
      resolutions: ['1K', '2K', '4K'],
      qualities: [],
      maxCount: 1,
      maxReferences: 14,
    });
    expect(imageControls(gptImage).maxCount).toBe(4);
    expect(imageControls(noOptions)).toEqual({
      aspectRatios: [],
      resolutions: [],
      qualities: [],
      maxCount: 1,
      maxReferences: 0,
    });
  });
});

describe('effectiveImageOptions and imageRequestOptions', () => {
  const saved = opts({ aspectRatio: '16:9', resolution: '2K', quality: 'high', count: 3 });

  it('keeps what the model supports and falls back to defaults for the rest', () => {
    expect(effectiveImageOptions(nanoBanana, saved)).toEqual(
      opts({ aspectRatio: '16:9', resolution: '2K' }),
    );
    expect(effectiveImageOptions(gptImage, saved)).toEqual(opts({ quality: 'high', count: 3 }));
  });

  it('leaves defaults out of the request', () => {
    expect(imageRequestOptions(nanoBanana, saved)).toEqual({
      aspect_ratio: '16:9',
      resolution: '2K',
    });
    expect(imageRequestOptions(gptImage, saved)).toEqual({ n: 3, quality: 'high' });
    expect(imageRequestOptions(noOptions, saved)).toEqual({});
  });
});

describe('estimateImageCost', () => {
  it('uses a flat per-image price as is', () => {
    const lines = [
      { billable: 'output_image', unit: 'image', cost_usd: 0.035 },
      { billable: 'input_image', unit: 'image', cost_usd: 0 },
    ];
    expect(estimateImageCost(lines, opts())).toEqual({ cost: 0.035, exact: true });
  });

  it('picks the price for the chosen resolution, defaulting to 1K', () => {
    const lines = [
      { billable: 'output_image', unit: 'image', cost_usd: 0.048, variant: '1k' },
      { billable: 'output_image', unit: 'image', cost_usd: 0.1, variant: '2k' },
    ];
    expect(estimateImageCost(lines, opts({ resolution: '2K' }))).toEqual({
      cost: 0.1,
      exact: true,
    });
    expect(estimateImageCost(lines, opts())).toEqual({ cost: 0.048, exact: true });
  });

  it('matches combined quality and resolution variants, else flags a guess', () => {
    const lines = [
      { billable: 'output_image', unit: 'image', cost_usd: 0.04, variant: 'low_1k' },
      { billable: 'output_image', unit: 'image', cost_usd: 0.08, variant: 'medium_2k' },
    ];
    expect(estimateImageCost(lines, opts({ quality: 'medium', resolution: '2K' }))).toEqual({
      cost: 0.08,
      exact: true,
    });
    expect(estimateImageCost(lines, opts())).toEqual({ cost: 0.04, exact: false });
  });

  it('estimates megapixel and token pricing', () => {
    const mp = [{ billable: 'output_image', unit: 'megapixel', cost_usd: 0.03 }];
    expect(estimateImageCost(mp, opts())!.cost).toBeCloseTo(0.0315, 4);
    expect(estimateImageCost(mp, opts())!.exact).toBe(false);

    const tokens = [{ billable: 'output_image', unit: 'token', cost_usd: 0.00003 }];
    expect(estimateImageCost(tokens, opts())!.cost).toBeCloseTo(0.039, 4);
    expect(estimateImageCost(tokens, opts({ quality: 'high' }))!.cost).toBeCloseTo(0.1248, 4);
  });

  it('returns null without an output price', () => {
    expect(estimateImageCost([], opts())).toBeNull();
    expect(
      estimateImageCost([{ billable: 'input_image', unit: 'image', cost_usd: 0.01 }], opts()),
    ).toBeNull();
  });
});

describe('decodeImages', () => {
  it('decodes base64, sniffing the type when it is missing', () => {
    const png = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47));
    const jpeg = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0));
    const images = decodeImages({
      data: [
        { b64_json: png, media_type: 'image/png' },
        { b64_json: jpeg },
        { media_type: 'image/png' },
      ],
    });
    expect(images).toEqual([
      { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), mime: 'image/png' },
      { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), mime: 'image/jpeg' },
    ]);
    expect(decodeImages({})).toEqual([]);
  });
});

describe('file names', () => {
  it('slugs the prompt and numbers the image', () => {
    expect(imageFileName('A fox in the snow, oil painting!', 1, 'png')).toBe(
      'a-fox-in-the-snow-oil-painting-2.png',
    );
    expect(imageFileName('🦊', 0, 'jpg')).toBe('image-1.jpg');
  });
  it('maps types to extensions', () => {
    expect(imageExtension('image/jpeg')).toBe('jpg');
    expect(imageExtension('image/webp')).toBe('webp');
    expect(imageExtension('image/svg+xml')).toBe('svg');
  });
});

describe('imageSupportIssues', () => {
  it('blocks non-image attachments and too many references', () => {
    expect(imageSupportIssues(['image', 'pdf'], nanoBanana, 'Nano Banana')).toEqual([
      { kind: 'pdf', level: 'block', message: 'Image models only take images as references.' },
    ]);
    expect(imageSupportIssues(['image'], noOptions, 'Muse')).toEqual([
      { kind: 'image', level: 'block', message: "Muse can't edit images." },
    ]);
    const many = Array.from({ length: 15 }, () => 'image' as const);
    expect(imageSupportIssues(many, nanoBanana, 'Nano Banana')[0]?.message).toBe(
      'Nano Banana takes at most 14 reference images.',
    );
    expect(imageSupportIssues(['image', 'image'], nanoBanana, 'Nano Banana')).toEqual([]);
  });
});
