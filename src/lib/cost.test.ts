import { chatCost, formatCost, formatTokens, messageCost } from './cost';
import type { Message } from '@/types/domain';
import type { OpenRouterModel } from './openrouter/types';

const model: OpenRouterModel = {
  id: 'x/y',
  name: 'Y',
  pricing: { prompt: '0.000001', completion: '0.000002' },
};
const base: Message = {
  id: '1',
  chatId: 'c',
  role: 'assistant',
  content: 'hi',
  reasoning: null,
  modelId: 'x/y',
  finishReason: 'stop',
  usage: null,
  createdAt: 0,
};

describe('messageCost', () => {
  it('uses the charged cost when present', () => {
    expect(messageCost({ ...base, usage: { cost: 0.0123 } }, model)).toEqual({
      cost: 0.0123,
      exact: true,
    });
  });
  it('estimates from list price otherwise', () => {
    const c = messageCost(
      { ...base, usage: { prompt_tokens: 1000, completion_tokens: 500 } },
      model,
    );
    expect(c?.exact).toBe(false);
    expect(c?.cost).toBeCloseTo(0.002, 6);
  });
  it('returns null without usage or pricing', () => {
    expect(messageCost(base, model)).toBeNull();
    expect(messageCost({ ...base, usage: { prompt_tokens: 5 } }, undefined)).toBeNull();
  });
});

describe('chatCost', () => {
  it('sums assistant messages and tracks exactness', () => {
    const byId = new Map([[model.id, model]]);
    const total = chatCost(
      [
        { ...base, role: 'user' },
        { ...base, usage: { cost: 0.01, total_tokens: 100 } },
        {
          ...base,
          id: '2',
          usage: { prompt_tokens: 1000, completion_tokens: 0, total_tokens: 1000 },
        },
      ],
      byId,
    );
    expect(total?.count).toBe(2);
    expect(total?.tokens).toBe(1100);
    expect(total?.exact).toBe(false);
    expect(total?.cost).toBeCloseTo(0.011, 6);
  });
});

describe('formatCost', () => {
  it('scales precision and marks estimates', () => {
    expect(formatCost({ cost: 0, exact: true })).toBe('$0');
    expect(formatCost({ cost: 0.00042, exact: true })).toBe('$0.0004');
    expect(formatCost({ cost: 0.0099, exact: true })).toBe('$0.0099');
    expect(formatCost({ cost: 0.01, exact: true })).toBe('$0.01');
    expect(formatCost({ cost: 0.123, exact: false })).toBe('~$0.12');
    expect(formatCost({ cost: 2.5, exact: true })).toBe('$2.50');
    expect(formatCost({ cost: 9.999, exact: true })).toBe('$10.00');
    expect(formatCost({ cost: 10, exact: true })).toBe('$10.0');
    expect(formatCost({ cost: 21.14, exact: true })).toBe('$21.1');
  });
});

describe('formatTokens', () => {
  it('follows the k/M/B truncation rules', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(1000)).toBe('1.0k');
    expect(formatTokens(1072)).toBe('1.0k');
    expect(formatTokens(9999)).toBe('9.9k');
    expect(formatTokens(19028)).toBe('19k');
    expect(formatTokens(892733)).toBe('892k');
    expect(formatTokens(999_999)).toBe('999k');
    expect(formatTokens(1_250_000)).toBe('1.2M');
    expect(formatTokens(48_000_000)).toBe('48M');
    expect(formatTokens(2_700_000_000)).toBe('2.7B');
  });
});
