import type { StreamChunk, StreamEvent } from './types';

/**
 * Converts a raw OpenRouter SSE `data:` payload into zero or more stream events.
 * Pure function so it can be unit-tested without a network.
 */
export function chunkToEvents(payload: string): StreamEvent[] {
  const trimmed = payload.trim();
  if (!trimmed) return [];
  if (trimmed === '[DONE]') return [];

  let chunk: StreamChunk;
  try {
    chunk = JSON.parse(trimmed) as StreamChunk;
  } catch {
    return [];
  }

  if (chunk.error) {
    return [
      {
        type: 'error',
        code: chunk.error.code,
        message: chunk.error.message ?? 'Unknown error from OpenRouter',
      },
    ];
  }

  const events: StreamEvent[] = [];
  const choice = chunk.choices?.[0];
  const delta = choice?.delta;

  if (delta) {
    if (delta.reasoning_details?.length) {
      for (const d of delta.reasoning_details) {
        const text = d.text ?? d.summary;
        if (text) events.push({ type: 'reasoning', text });
      }
    } else if (delta.reasoning) {
      events.push({ type: 'reasoning', text: delta.reasoning });
    }
    if (delta.content) events.push({ type: 'content', text: delta.content });
  }

  const annotations = delta?.annotations ?? choice?.message?.annotations;
  if (annotations?.length) events.push({ type: 'annotations', annotations });

  if (chunk.usage) events.push({ type: 'usage', usage: chunk.usage });

  if (choice?.finish_reason) {
    events.push({ type: 'done', finishReason: choice.finish_reason });
  }

  return events;
}

/**
 * Reads an SSE body and yields events. Ignores comment lines (`: ...`) and stops on `[DONE]`.
 */
export async function* readSSE(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    while (true) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;

      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (!line || line.startsWith(':')) continue;
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        for (const ev of chunkToEvents(payload)) {
          yield ev;
          if (ev.type === 'error') return;
        }
      }
    }
    if (buffer.startsWith('data:')) {
      for (const ev of chunkToEvents(buffer.slice(5))) yield ev;
    }
  } finally {
    reader.releaseLock();
  }
}
