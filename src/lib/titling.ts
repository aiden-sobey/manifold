import { completeOnce } from './openrouter/client';
import type { OpenRouterModel } from './openrouter/types';
import { toReasoningParam } from './openrouter/reasoning';

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
      reasoning: toReasoningParam('off', titleModel),
      messages: [
        {
          role: 'system',
          content:
            'You write short titles for chat conversations. Reply with only a 3 to 7 word title. No quotes, no trailing punctuation, no preamble.',
        },
        {
          role: 'user',
          content: `User: ${userMessage.slice(0, 1500)}\n\nAssistant: ${assistantReply.slice(0, 500)}`,
        },
      ],
    });
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
