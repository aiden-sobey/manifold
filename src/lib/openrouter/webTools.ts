import type { Citation } from '@/types/domain';
import type { Annotation, OpenRouterModel, ServerTool } from './types';

/**
 * Web search and fetch, run by OpenRouter. The model decides when to use them, so a reply only
 * costs extra when it actually searches or fetches a page.
 */
export const WEB_TOOLS: ServerTool[] = [
  // Naming one engine gives every model the same results, so compare is fair.
  {
    type: 'openrouter:web_search',
    parameters: { engine: 'parallel', mode: 'fast', max_results: 5, max_uses: 4 },
  },
  // Fetched pages become prompt tokens; cap them so one long page can't cost dollars on a big model.
  { type: 'openrouter:web_fetch', parameters: { max_uses: 5, max_content_tokens: 25_000 } },
];

/** Searches plus fetches allowed in one reply. Backstop in case an engine ignores `max_uses`. */
export const MAX_WEB_TOOL_CALLS = 6;

/** Server tools need a model that can call tools at all. */
export function supportsTools(model: OpenRouterModel | undefined): boolean {
  return Boolean(model?.supported_parameters?.includes('tools'));
}

/**
 * System prompt sent alongside the web tools. Models don't know today's date, so without it they
 * can't tell that a question is about something newer than their training data.
 */
export function webSystemPrompt(now: Date, timeZone: string): string {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(now);
  return [
    `Today is ${weekday}, ${date} (${timeZone}).`,
    'You can search the web and read web pages. Use them when the question involves recent events, current prices, new releases or versions, or anything else that may have changed since your training data. Answer from your own knowledge when it is enough.',
    'When you use a source, link to it inline in markdown.',
  ].join('\n\n');
}

/** Adds the url_citation annotations to `existing`, skipping URLs already listed. */
export function mergeCitations(existing: Citation[], annotations: Annotation[]): Citation[] {
  const out = [...existing];
  const seen = new Set(out.map((c) => c.url));
  for (const a of annotations) {
    if (a.type !== 'url_citation') continue;
    const url = a.url_citation?.url ?? a.url;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, title: a.url_citation?.title || a.title || null });
  }
  return out;
}

/** "www.example.com/a/b" → "example.com". Falls back to the raw string for unparseable URLs. */
export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
