import {
  buildHistory,
  buildUserContent,
  pluginsFor,
  textAttachmentBlock,
  toBase64,
} from './content';
import { pdfEngineFor, supportIssues } from './support';
import type { OpenRouterModel } from '@/lib/openrouter/types';
import type { Attachment, Message } from '@/types/domain';

const att = (over: Partial<Attachment>): Attachment => ({
  id: 'a1',
  messageId: 'm1',
  chatId: 'c1',
  kind: 'text',
  name: 'notes.md',
  mime: 'text/markdown',
  size: 10,
  relPath: 'attachments/c1/a1.md',
  width: null,
  height: null,
  textContent: 'hello',
  annotation: null,
  createdAt: 0,
  ...over,
});
const bytes = () => Promise.resolve(new Uint8Array([1, 2, 3]));
const vision: OpenRouterModel = {
  id: 'v',
  name: 'V',
  architecture: { input_modalities: ['text', 'image', 'file'] },
};
const textOnly: OpenRouterModel = {
  id: 't',
  name: 'T',
  architecture: { input_modalities: ['text'] },
};

describe('buildUserContent', () => {
  it('passes plain strings through', async () => {
    expect(await buildUserContent({ content: 'hi' }, bytes)).toBe('hi');
  });
  it('inlines text, encodes images and pdfs, text last', async () => {
    const parts = await buildUserContent(
      {
        content: 'what is this?',
        attachments: [
          att({ kind: 'image', name: 'p.png', mime: 'image/png', textContent: null }),
          att({ id: 'a2', kind: 'text', name: 'a.ts', textContent: 'const x = 1;' }),
          att({ id: 'a3', kind: 'pdf', name: 'd.pdf', mime: 'application/pdf', textContent: null }),
        ],
      },
      bytes,
    );
    expect(Array.isArray(parts)).toBe(true);
    const p = parts as unknown as Array<Record<string, unknown>>;
    expect(p.map((x) => x.type)).toEqual(['text', 'image_url', 'file', 'text']);
    expect((p[1]?.image_url as { url: string }).url).toBe(
      `data:image/png;base64,${toBase64(new Uint8Array([1, 2, 3]))}`,
    );
    expect((p[2]?.file as { filename: string }).filename).toBe('d.pdf');
    expect(p[3]?.text).toBe('what is this?');
  });
  it('fences text with a longer fence than the content uses', () => {
    const block = textAttachmentBlock({ name: 'x.md', textContent: 'a\n```js\nb\n```' });
    expect(block.startsWith('````markdown title="x.md"\n')).toBe(true);
    expect(block.endsWith('\n````')).toBe(true);
  });
});

describe('history and plugins', () => {
  const msgs: Message[] = [
    {
      id: 'm1',
      chatId: 'c1',
      role: 'user',
      content: 'summarise',
      reasoning: null,
      modelId: null,
      finishReason: null,
      usage: null,
      lane: null,
      firstTokenMs: null,
      totalMs: null,
      createdAt: 0,
      attachments: [
        att({
          kind: 'pdf',
          name: 'd.pdf',
          mime: 'application/pdf',
          textContent: null,
          annotation: { type: 'file', file: { hash: 'h' } },
        }),
      ],
    },
    {
      id: 'm2',
      chatId: 'c1',
      role: 'assistant',
      content: 'ok',
      reasoning: null,
      modelId: 'v',
      finishReason: 'stop',
      usage: null,
      lane: null,
      firstTokenMs: null,
      totalMs: null,
      createdAt: 1,
    },
    {
      id: 'm3',
      chatId: 'c1',
      role: 'user',
      content: 'more',
      reasoning: null,
      modelId: null,
      finishReason: null,
      usage: null,
      lane: null,
      firstTokenMs: null,
      totalMs: null,
      createdAt: 2,
    },
  ];
  it('echoes pdf annotations on the following assistant turn', async () => {
    const h = await buildHistory(msgs, bytes);
    expect(h[1]?.annotations).toEqual([{ type: 'file', file: { hash: 'h' } }]);
    expect(h[2]?.content).toBe('more');
  });
  it('adds the file-parser plugin only when a pdf is present', () => {
    expect(pluginsFor(msgs, vision, false)).toEqual([
      { id: 'file-parser', pdf: { engine: 'native' } },
    ]);
    expect(pluginsFor(msgs, textOnly, false)?.[0]?.pdf.engine).toBe('cloudflare-ai');
    expect(pluginsFor(msgs, textOnly, true)?.[0]?.pdf.engine).toBe('mistral-ocr');
    expect(pluginsFor([msgs[2]!], vision, false)).toBeUndefined();
  });
});

describe('support', () => {
  it('blocks images on text-only models and notes pdfs', () => {
    const issues = supportIssues(['image', 'pdf', 'text'], textOnly, 'T');
    expect(issues.map((i) => `${i.kind}:${i.level}`)).toEqual(['image:block', 'pdf:note']);
    expect(supportIssues(['image', 'pdf'], vision, 'V')).toEqual([]);
  });
  it('picks a pdf engine', () => {
    expect(pdfEngineFor(vision, false)).toBe('native');
    expect(pdfEngineFor(textOnly, false)).toBe('cloudflare-ai');
    expect(pdfEngineFor(vision, true)).toBe('mistral-ocr');
  });
});
