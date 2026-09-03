import type { OpenRouterModel } from './openrouter/types';
import type { Message } from '@/types/domain';

export interface CostInfo {
  /** USD. OpenRouter credits are denominated in USD. */
  cost: number;
  /** True when OpenRouter reported the charged amount; false when estimated from list price. */
  exact: boolean;
}

/** Cost of one assistant message. Prefers the charged amount, falls back to a list-price estimate. */
export function messageCost(m: Message, model: OpenRouterModel | undefined): CostInfo | null {
  const u = m.usage;
  if (!u) return null;
  if (typeof u.cost === 'number') return { cost: u.cost, exact: true };
  const prompt = Number(model?.pricing?.prompt ?? NaN);
  const completion = Number(model?.pricing?.completion ?? NaN);
  if (!Number.isFinite(prompt) || !Number.isFinite(completion)) return null;
  const pt = u.prompt_tokens ?? 0;
  const ct = u.completion_tokens ?? 0;
  if (!pt && !ct) return null;
  return { cost: pt * prompt + ct * completion, exact: false };
}

export function chatCost(
  messages: Message[],
  byId: Map<string, OpenRouterModel>,
): (CostInfo & { tokens: number; count: number }) | null {
  let cost = 0;
  let exact = true;
  let tokens = 0;
  let count = 0;
  for (const m of messages) {
    if (m.role !== 'assistant' || m.streaming) continue;
    const c = messageCost(m, m.modelId ? byId.get(m.modelId) : undefined);
    if (!c) continue;
    cost += c.cost;
    exact &&= c.exact;
    tokens += m.usage?.total_tokens ?? 0;
    count += 1;
  }
  if (count === 0) return null;
  return { cost, exact, tokens, count };
}

/**
 * Below one cent: four decimals so tiny costs are still visible ($0.0007).
 * From one cent up: cents ($0.01, $4.37). From ten dollars up: ten-cent steps ($21.1).
 */
export function formatCost(c: CostInfo): string {
  const prefix = c.exact ? '' : '~';
  const v = c.cost;
  if (v === 0) return `${prefix}$0`;
  if (v < 0.00005) return `<$0.0001`;
  if (v >= 10) return `${prefix}$${v.toFixed(1)}`;
  if (v >= 0.01) return `${prefix}$${v.toFixed(2)}`;
  return `${prefix}$${v.toFixed(4)}`;
}

/**
 * <1000: exact. Then k / M / B, truncated (not rounded): one decimal below 10 units
 * (1072 -> 1.0k), whole units from 10 up (19028 -> 19k, 892733 -> 892k).
 */
export function formatTokens(n: number): string {
  if (n < 1000) return String(Math.floor(n));
  const units: Array<[number, string]> = [
    [1_000_000_000, 'B'],
    [1_000_000, 'M'],
    [1_000, 'k'],
  ];
  for (const [size, suffix] of units) {
    if (n >= size) {
      const v = n / size;
      if (v < 10) return `${(Math.floor(v * 10) / 10).toFixed(1)}${suffix}`;
      return `${Math.floor(v)}${suffix}`;
    }
  }
  return String(n);
}
