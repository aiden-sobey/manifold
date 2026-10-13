import type { OpenRouterModel } from './types';
import { mergeCitations, sourceHost, supportsTools, webSystemPrompt } from './webTools';

const model = (supported_parameters?: string[]): OpenRouterModel => ({
  id: 'x/y',
  name: 'Y',
  supported_parameters,
});

describe('supportsTools', () => {
  it('needs the tools parameter', () => {
    expect(supportsTools(model(['tools', 'reasoning']))).toBe(true);
    expect(supportsTools(model(['reasoning']))).toBe(false);
    expect(supportsTools(model())).toBe(false);
    expect(supportsTools(undefined)).toBe(false);
  });
});

describe('webSystemPrompt', () => {
  it("states the date in the user's time zone", () => {
    // 22:30 UTC on Monday 12 Oct is already Tuesday 13 Oct in Sydney.
    const now = new Date('2026-10-12T22:30:00Z');
    expect(webSystemPrompt(now, 'Australia/Sydney')).toMatch(
      /^Today is Tuesday, 2026-10-13 \(Australia\/Sydney\)\./,
    );
    expect(webSystemPrompt(now, 'UTC')).toMatch(/^Today is Monday, 2026-10-12 \(UTC\)\./);
  });
});

describe('mergeCitations', () => {
  it('collects nested and flattened url citations, skipping duplicates and file annotations', () => {
    const merged = mergeCitations(
      [{ url: 'https://a.com', title: 'A' }],
      [
        { type: 'url_citation', url_citation: { url: 'https://a.com', title: 'A again' } },
        { type: 'url_citation', url_citation: { url: 'https://b.com', title: 'B' } },
        { type: 'url_citation', url: 'https://c.com', title: 'C' },
        { type: 'url_citation', url_citation: { url: 'https://d.com', title: '' } },
        { type: 'url_citation', url_citation: {} },
        { type: 'file', file: { name: 'doc.pdf' } },
      ],
    );
    expect(merged).toEqual([
      { url: 'https://a.com', title: 'A' },
      { url: 'https://b.com', title: 'B' },
      { url: 'https://c.com', title: 'C' },
      { url: 'https://d.com', title: null },
    ]);
  });

  it('returns a copy when nothing is added', () => {
    const existing = [{ url: 'https://a.com', title: null }];
    const merged = mergeCitations(existing, []);
    expect(merged).toEqual(existing);
    expect(merged).not.toBe(existing);
  });
});

describe('sourceHost', () => {
  it('strips www and paths', () => {
    expect(sourceHost('https://www.example.com/a/b?c=1')).toBe('example.com');
    expect(sourceHost('https://news.ycombinator.com/item?id=1')).toBe('news.ycombinator.com');
  });
  it('falls back to the input for unparseable URLs', () => {
    expect(sourceHost('not a url')).toBe('not a url');
  });
});
