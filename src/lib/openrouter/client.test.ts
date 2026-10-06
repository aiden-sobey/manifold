import { OpenRouterError, listTranscriptionModels, transcribeAudio } from './client';
import type { OpenRouterModel } from './types';

const response = (body: unknown, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status: 200, headers });

beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe('transcription API', () => {
  it('loads only transcription models', async () => {
    const model: OpenRouterModel = { id: 'openai/whisper-large-v3-turbo', name: 'Whisper' };
    vi.mocked(fetch).mockResolvedValueOnce(response({ data: [model] }));
    await expect(listTranscriptionModels()).resolves.toEqual([model]);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'https://openrouter.ai/api/v1/models?output_modalities=transcription',
    );
  });

  it('posts base64 audio with the real format and returned usage', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({
        text: 'hello',
        model: 'provider/actual-model',
        usage: { cost: 0.002, seconds: 2, input_tokens: 4, output_tokens: 1 },
      }),
    );
    const audio = new Blob([new Uint8Array([0, 1, 255])], { type: 'audio/webm' });
    const result = await transcribeAudio('secret', 'openai/whisper-large-v3-turbo', audio, 'webm');
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('https://openrouter.ai/api/v1/audio/transcriptions');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret');
    expect(JSON.parse(init?.body as string)).toEqual({
      model: 'openai/whisper-large-v3-turbo',
      input_audio: { data: 'AAH/', format: 'webm' },
    });
    expect(result).toEqual({
      text: 'hello',
      modelId: 'provider/actual-model',
      usage: {
        cost: 0.002,
        seconds: 2,
        input_tokens: 4,
        output_tokens: 1,
        prompt_tokens: 4,
        completion_tokens: 1,
      },
    });
  });

  it('keeps OpenRouter usage and rejects a missing transcript', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ text: 'words', usage: { seconds: 3 } }))
      .mockResolvedValueOnce(response({}));
    await expect(
      transcribeAudio('secret', 'm', new Blob(['audio']), 'webm'),
    ).resolves.toMatchObject({ text: 'words', usage: { seconds: 3 } });
    await expect(
      transcribeAudio('secret', 'm', new Blob(['audio']), 'webm'),
    ).rejects.toBeInstanceOf(OpenRouterError);
  });
});
