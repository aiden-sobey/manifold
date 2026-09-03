vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: vi.fn() } }));
import { buildPrompt, parseGreetings } from './greeting';

describe('parseGreetings', () => {
  it('extracts a fenced JSON array and trims punctuation', () => {
    const raw =
      'Sure!\n```json\n[{"heading":"Back to the Stoics?","subtext":"Try Kimi K3 this time."},{"heading":"Fresh start!","subtext":"Anything goes."}]\n```';
    expect(parseGreetings(raw)).toEqual([
      { heading: 'Back to the Stoics?', subtext: 'Try Kimi K3 this time.' },
      { heading: 'Fresh start', subtext: 'Anything goes.' },
    ]);
  });
  it('recovers complete objects from a truncated reply', () => {
    const raw =
      '[{"heading":"One?","subtext":"a"},{"heading":"Two?","subtext":"b"},{"heading":"Thr';
    expect(parseGreetings(raw)).toEqual([
      { heading: 'One?', subtext: 'a' },
      { heading: 'Two?', subtext: 'b' },
    ]);
  });
  it('drops malformed or overlong entries', () => {
    const raw = JSON.stringify([
      { heading: 'ok', subtext: 'fine' },
      { heading: 'x'.repeat(61), subtext: 'too long heading' },
      { heading: 'no subtext' },
      'nope',
    ]);
    expect(parseGreetings(raw)).toHaveLength(1);
    expect(parseGreetings('not json')).toEqual([]);
  });
});

describe('buildPrompt', () => {
  it('includes recent chats and favourites', () => {
    const p = buildPrompt({
      recentChats: [{ title: 'Stoic determinism', model: 'DeepSeek V4 Flash', daysAgo: 1 }],
      chatsThisWeek: 3,
      favouriteModels: ['Kimi K3'],
      unusedFavourites: ['Kimi K3'],
    });
    expect(p).toContain('"Stoic determinism" (DeepSeek V4 Flash, 1d ago)');
    expect(p).toContain('Chats this week: 3');
    expect(p).toContain('exactly 5');
  });
});
