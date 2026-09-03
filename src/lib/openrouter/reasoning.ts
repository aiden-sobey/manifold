import type { ThinkingLevel } from '@/types/domain';
import type { OpenRouterModel, ReasoningParam } from './types';

const EFFORT_ORDER = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

export function supportsReasoning(model: OpenRouterModel | undefined): boolean {
  if (!model) return false;
  if (model.reasoning) return true;
  return (model.supported_parameters ?? []).some(
    (p) => p === 'reasoning' || p === 'include_reasoning' || p === 'reasoning_effort',
  );
}

/** Levels the UI should offer for this model. Empty when the model has no reasoning. */
export function availableLevels(model: OpenRouterModel | undefined): ThinkingLevel[] {
  if (!supportsReasoning(model)) return [];
  const efforts = model?.reasoning?.supported_efforts;
  const levels: ThinkingLevel[] = ['default'];

  if (!model?.reasoning?.mandatory) levels.push('off');

  if (efforts && efforts.length > 0) {
    for (const e of EFFORT_ORDER) if (efforts.includes(e)) levels.push(e);
  } else {
    // Model advertises reasoning without an effort list: offer the common three.
    levels.push('low', 'medium', 'high');
  }
  return levels;
}

/** Maps a thinking level to the request `reasoning` param. `undefined` means omit it. */
export function toReasoningParam(
  level: ThinkingLevel,
  model: OpenRouterModel | undefined,
): ReasoningParam | undefined {
  if (!supportsReasoning(model)) return undefined;
  if (level === 'default') return undefined;

  const efforts = model?.reasoning?.supported_efforts;

  if (level === 'off') {
    if (efforts?.includes('none')) return { effort: 'none' };
    if (model?.reasoning?.mandatory) return { exclude: true };
    return { enabled: false };
  }

  if (efforts && efforts.length > 0) {
    if (efforts.includes(level)) return { effort: level };
    return undefined;
  }

  // No effort list: fall back to a token budget.
  const budgets: Partial<Record<ThinkingLevel, number>> = {
    minimal: 512,
    low: 1024,
    medium: 4096,
    high: 16384,
    xhigh: 32768,
    max: 65536,
  };
  const max_tokens = budgets[level];
  return max_tokens ? { max_tokens } : undefined;
}

export const LEVEL_LABELS: Record<ThinkingLevel, string> = {
  default: 'Default',
  off: 'Off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
};
