import { insertSystemUsage } from './db';
import { completeOnce } from './openrouter/client';
import type { OpenRouterModel, ReasoningParam } from './openrouter/types';
import { toReasoningParam } from './openrouter/reasoning';

export interface Greeting {
  heading: string;
  subtext: string;
}

export const FALLBACK_GREETING: Greeting = {
  heading: 'What are we testing today?',
  subtext:
    'Pick a model and thinking level below, then send a message. Switch models mid-chat and hit regenerate to compare answers.',
};

export interface GreetingContext {
  /** Most recent first. */
  recentChats: Array<{ title: string; model: string; daysAgo: number }>;
  chatsThisWeek: number;
  favouriteModels: string[];
  unusedFavourites: string[];
}

function reasoningFor(model: OpenRouterModel | undefined): ReasoningParam | undefined {
  const efforts = model?.reasoning?.supported_efforts ?? [];
  if (model?.reasoning?.mandatory && efforts.includes('low'))
    return { effort: 'low', exclude: true };
  return toReasoningParam('off', model);
}

/**
 * Pulls greeting objects out of a model reply, tolerating code fences, chatter, and a reply that
 * was cut off mid-array (every complete object is still recovered).
 */
export function parseGreetings(raw: string): Greeting[] {
  let parsed: unknown = null;
  const arr = /\[[\s\S]*\]/.exec(raw);
  if (arr) {
    try {
      parsed = JSON.parse(arr[0]);
    } catch {
      parsed = null;
    }
  }
  if (!Array.isArray(parsed)) {
    // Fall back to individual complete objects.
    parsed = [...raw.matchAll(/\{[^{}]*\}/g)].flatMap((m) => {
      try {
        return [JSON.parse(m[0]) as unknown];
      } catch {
        return [];
      }
    });
  }
  const out: Greeting[] = [];
  for (const item of parsed as unknown[]) {
    if (!item || typeof item !== 'object') continue;
    const h = (item as { heading?: unknown }).heading;
    const s = (item as { subtext?: unknown }).subtext;
    if (typeof h !== 'string' || typeof s !== 'string') continue;
    const heading = h.trim().replace(/[.!]+$/, '');
    const subtext = s.trim();
    if (!heading || !subtext || heading.length > 60 || subtext.length > 160) continue;
    out.push({ heading, subtext });
  }
  return out;
}

export function buildPrompt(ctx: GreetingContext): string {
  const chats = ctx.recentChats
    .slice(0, 10)
    .map((c) => `- "${c.title}" (${c.model}, ${c.daysAgo === 0 ? 'today' : `${c.daysAgo}d ago`})`)
    .join('\n');
  return [
    'You write the empty-state greeting for a desktop app used to test and compare AI models via OpenRouter.',
    'Produce exactly 5 distinct greetings as a JSON array of objects with "heading" and "subtext".',
    'Rules: heading is at most 6 words, phrased as a question or invitation, no exclamation marks, no emoji.',
    'Subtext is one sentence, at most 18 words, plain and specific. Reference recent topics or suggest a model to try.',
    'Vary the angle across the five: continue a topic, contrast two models, try an unused favourite, a fresh start, a light observation about usage.',
    'Do not invent facts beyond the context. Return only the JSON array.',
    '',
    'Context:',
    `Recent chats (newest first):\n${chats || '- none yet'}`,
    `Chats this week: ${ctx.chatsThisWeek}`,
    `Favourite models: ${ctx.favouriteModels.join(', ') || 'none'}`,
    `Favourites not used in the last week: ${ctx.unusedFavourites.join(', ') || 'none'}`,
  ].join('\n');
}

export async function generateGreetings(
  apiKey: string,
  modelId: string,
  model: OpenRouterModel | undefined,
  ctx: GreetingContext,
): Promise<Greeting[]> {
  try {
    const res = await completeOnce(apiKey, {
      model: modelId,
      // Reasoning models count thinking tokens against this budget even when excluded from output.
      max_tokens: 2500,
      temperature: 0.9,
      reasoning: reasoningFor(model),
      messages: [{ role: 'user', content: buildPrompt(ctx) }],
    });
    if (res.usage) {
      insertSystemUsage({
        purpose: 'greeting',
        modelId: res.model || modelId,
        usage: res.usage,
      }).catch(() => undefined);
    }
    return parseGreetings(res.choices[0]?.message.content ?? '');
  } catch {
    return [];
  }
}
