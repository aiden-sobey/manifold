vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: vi.fn() } }));
vi.mock('@tauri-apps/plugin-store', () => ({ load: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { formatPrice, shortName } from './ModelPicker';

describe('shortName', () => {
  it('strips the producer prefix', () => {
    expect(shortName('Anthropic: Claude Sonnet 5')).toBe('Claude Sonnet 5');
    expect(shortName('OpenAI: GPT-5.6 Luna')).toBe('GPT-5.6 Luna');
  });
  it('leaves names without a prefix alone', () => {
    expect(shortName('DeepSeek V4 Flash Latest')).toBe('DeepSeek V4 Flash Latest');
  });
});

describe('formatPrice', () => {
  it('formats per-million prices', () => {
    expect(formatPrice('0.000003')).toBe('$3.0');
    expect(formatPrice('0')).toBe('free');
    expect(formatPrice(undefined)).toBe('');
  });
});
