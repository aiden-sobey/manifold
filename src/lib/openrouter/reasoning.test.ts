import { availableLevels, toReasoningParam } from './reasoning';
import type { OpenRouterModel } from './types';

const mandatory: OpenRouterModel = {
  id: 'm/mandatory',
  name: 'Mandatory',
  reasoning: { mandatory: true, supported_efforts: ['xhigh', 'high', 'medium', 'low', 'minimal'] },
};
const optional: OpenRouterModel = {
  id: 'm/optional',
  name: 'Optional',
  reasoning: { mandatory: false, supported_efforts: ['none', 'low', 'medium', 'high'] },
};
const budgetOnly: OpenRouterModel = {
  id: 'm/budget',
  name: 'Budget',
  supported_parameters: ['reasoning'],
};
const none: OpenRouterModel = { id: 'm/none', name: 'None', supported_parameters: ['temperature'] };

describe('availableLevels', () => {
  it('returns nothing for models without reasoning', () => {
    expect(availableLevels(none)).toEqual([]);
    expect(availableLevels(undefined)).toEqual([]);
  });
  it('omits off for mandatory reasoning and orders efforts', () => {
    expect(availableLevels(mandatory)).toEqual([
      'default',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
  });
  it('includes off for optional reasoning', () => {
    expect(availableLevels(optional)).toEqual(['default', 'off', 'low', 'medium', 'high']);
  });
  it('falls back to low/medium/high without an effort list', () => {
    expect(availableLevels(budgetOnly)).toEqual(['default', 'off', 'low', 'medium', 'high']);
  });
});

describe('toReasoningParam', () => {
  it('omits for default and unsupported models', () => {
    expect(toReasoningParam('default', optional)).toBeUndefined();
    expect(toReasoningParam('high', none)).toBeUndefined();
  });
  it('maps off correctly', () => {
    expect(toReasoningParam('off', optional)).toEqual({ effort: 'none' });
    expect(toReasoningParam('off', mandatory)).toEqual({ exclude: true });
    expect(toReasoningParam('off', budgetOnly)).toEqual({ enabled: false });
  });
  it('maps efforts when supported', () => {
    expect(toReasoningParam('high', optional)).toEqual({ effort: 'high' });
    expect(toReasoningParam('max', optional)).toBeUndefined();
  });
  it('uses token budgets without an effort list', () => {
    expect(toReasoningParam('medium', budgetOnly)).toEqual({ max_tokens: 4096 });
  });
});
