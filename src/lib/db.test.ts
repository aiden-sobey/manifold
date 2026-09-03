vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: vi.fn() } }));
import { toFtsQuery } from './db';

describe('toFtsQuery', () => {
  it('quotes tokens and adds prefix wildcards', () => {
    expect(toFtsQuery('hello world')).toBe('"hello"* "world"*');
  });
  it('strips quotes and empty tokens', () => {
    expect(toFtsQuery('  "foo"   ')).toBe('"foo"*');
    expect(toFtsQuery('   ')).toBe('');
  });
});
