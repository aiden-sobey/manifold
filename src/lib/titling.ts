import { completeOnce } from './openrouter/client';
import { insertSystemUsage } from './db';
import type { OpenRouterModel } from './openrouter/types';
import { toReasoningParam } from './openrouter/reasoning';
import type { ReasoningParam } from './openrouter/types';

/** Titles need no thinking: turn it off, or use the lowest effort when the model insists on reasoning. */
function titleReasoning(model: OpenRouterModel | undefined): ReasoningParam | undefined {
  const efforts = model?.reasoning?.supported_efforts ?? [];
  if (model?.reasoning?.mandatory && efforts.includes('low'))
    return { effort: 'low', exclude: true };
  return toReasoningParam('off', model);
}

export function fallbackTitle(firstMessage: string): string {
  const oneLine = firstMessage.replace(/\s+/g, ' ').trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 57)}…` : oneLine || 'New chat';
}

export async function generateTitle(
  apiKey: string,
  titleModelId: string,
  titleModel: OpenRouterModel | undefined,
  userMessage: string,
  assistantReply: string,
): Promise<string | null> {
  try {
    const res = await completeOnce(apiKey, {
      model: titleModelId,
      max_tokens: 24,
      temperature: 0.3,
      reasoning: titleReasoning(titleModel),
      messages: [
        {
          role: 'system',
          content:
            'You write short titles for chat conversations. Reply with only a 3 to 7 word title. No quotes, no trailing punctuation, no preamble.',
        },
        {
          role: 'user',
          content: assistantReply
            ? `User: ${userMessage.slice(0, 1500)}\n\nAssistant: ${assistantReply.slice(0, 500)}`
            : `User: ${userMessage.slice(0, 1500)}`,
        },
      ],
    });
    if (res.usage) {
      insertSystemUsage({
        purpose: 'title',
        modelId: res.model || titleModelId,
        usage: res.usage,
      }).catch(() => undefined);
    }
    const raw = res.choices[0]?.message.content?.trim() ?? '';
    const title = raw
      .split('\n')[0]
      ?.replace(/^["'“”‘’]+|["'“”‘’.]+$/g, '')
      .trim();
    if (!title || title.length > 80) return null;
    return title;
  } catch {
    return null;
  }
}
