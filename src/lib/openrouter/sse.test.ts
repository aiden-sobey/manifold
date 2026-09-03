import { chunkToEvents, readSSE } from './sse';

function streamOf(text: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      // Split into small chunks to exercise buffering across boundaries.
      for (let i = 0; i < text.length; i += 7) controller.enqueue(enc.encode(text.slice(i, i + 7)));
      controller.close();
    },
  });
}

async function collect(s: ReadableStream<Uint8Array>) {
  const out = [];
  for await (const ev of readSSE(s)) out.push(ev);
  return out;
}

describe('chunkToEvents', () => {
  it('yields content deltas', () => {
    expect(chunkToEvents('{"choices":[{"delta":{"content":"Hi"}}]}')).toEqual([
      { type: 'content', text: 'Hi' },
    ]);
  });

  it('yields reasoning from reasoning_details', () => {
    const payload = JSON.stringify({
      choices: [{ delta: { reasoning_details: [{ type: 'reasoning.text', text: 'thinking' }] } }],
    });
    expect(chunkToEvents(payload)).toEqual([{ type: 'reasoning', text: 'thinking' }]);
  });

  it('yields reasoning from plain delta.reasoning', () => {
    const payload = JSON.stringify({ choices: [{ delta: { reasoning: 'hmm' } }] });
    expect(chunkToEvents(payload)).toEqual([{ type: 'reasoning', text: 'hmm' }]);
  });

  it('yields error events', () => {
    const payload = JSON.stringify({
      error: { code: 429, message: 'slow down' },
      choices: [{ finish_reason: 'error' }],
    });
    expect(chunkToEvents(payload)).toEqual([{ type: 'error', code: 429, message: 'slow down' }]);
  });

  it('yields usage and done', () => {
    const payload = JSON.stringify({
      choices: [{ delta: {}, finish_reason: 'stop' }],
      usage: { total_tokens: 10 },
    });
    expect(chunkToEvents(payload)).toEqual([
      { type: 'usage', usage: { total_tokens: 10 } },
      { type: 'done', finishReason: 'stop' },
    ]);
  });

  it('ignores garbage', () => {
    expect(chunkToEvents('not json')).toEqual([]);
    expect(chunkToEvents('[DONE]')).toEqual([]);
  });
});

describe('readSSE', () => {
  it('parses a full stream with comments and [DONE]', async () => {
    const raw = [
      ': OPENROUTER PROCESSING',
      '',
      'data: {"choices":[{"delta":{"content":"Hel"}}]}',
      '',
      ': OPENROUTER PROCESSING',
      'data: {"choices":[{"delta":{"content":"lo"}}]}',
      '',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":3}}',
      '',
      'data: [DONE]',
      '',
    ].join('\n');
    const events = await collect(streamOf(raw));
    expect(events).toEqual([
      { type: 'content', text: 'Hel' },
      { type: 'content', text: 'lo' },
      { type: 'usage', usage: { total_tokens: 3 } },
      { type: 'done', finishReason: 'stop' },
    ]);
  });

  it('stops after a mid-stream error', async () => {
    const raw = [
      'data: {"choices":[{"delta":{"content":"a"}}]}',
      'data: {"error":{"message":"boom"},"choices":[{"finish_reason":"error"}]}',
      'data: {"choices":[{"delta":{"content":"b"}}]}',
    ].join('\n\n');
    const events = await collect(streamOf(raw));
    expect(events).toEqual([
      { type: 'content', text: 'a' },
      { type: 'error', code: undefined, message: 'boom' },
    ]);
  });
});
