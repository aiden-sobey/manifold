import { groupTurns, historyForLane, lastReplyForLane } from './turns';
import type { Message } from '@/types/domain';

const msg = (id: string, role: 'user' | 'assistant', lane: number | null = null): Message => ({
  id,
  chatId: 'c',
  role,
  content: id,
  reasoning: null,
  modelId: null,
  finishReason: null,
  usage: null,
  lane,
  firstTokenMs: null,
  totalMs: null,
  createdAt: 0,
});

describe('groupTurns', () => {
  it('groups single-mode replies under lane 0', () => {
    const t = groupTurns([msg('u1', 'user'), msg('a1', 'assistant'), msg('u2', 'user')]);
    expect(t).toHaveLength(2);
    expect(t[0]?.replies.get(0)?.id).toBe('a1');
    expect(t[1]?.replies.size).toBe(0);
  });
  it('groups compare replies by lane regardless of arrival order', () => {
    const t = groupTurns([msg('u1', 'user'), msg('b', 'assistant', 1), msg('a', 'assistant', 0)]);
    expect(t[0]?.replies.get(0)?.id).toBe('a');
    expect(t[0]?.replies.get(1)?.id).toBe('b');
  });
});

describe('historyForLane', () => {
  const ms = [
    msg('u1', 'user'),
    msg('a0', 'assistant', 0),
    msg('a1', 'assistant', 1),
    msg('u2', 'user'),
  ];
  it('gives each lane only its own replies', () => {
    expect(historyForLane(ms, 0).map((m) => m.id)).toEqual(['u1', 'a0', 'u2']);
    expect(historyForLane(ms, 1).map((m) => m.id)).toEqual(['u1', 'a1', 'u2']);
  });
  it('single mode sees lane-null replies', () => {
    const single = [msg('u1', 'user'), msg('a', 'assistant'), msg('u2', 'user')];
    expect(historyForLane(single, null).map((m) => m.id)).toEqual(['u1', 'a', 'u2']);
  });
});

describe('lastReplyForLane', () => {
  it('finds the trailing reply for a lane and stops at a user message', () => {
    const ms = [msg('u1', 'user'), msg('a0', 'assistant', 0), msg('a1', 'assistant', 1)];
    expect(lastReplyForLane(ms, 1)?.id).toBe('a1');
    expect(lastReplyForLane(ms, 0)?.id).toBe('a0');
    expect(lastReplyForLane([...ms, msg('u2', 'user')], 0)).toBeUndefined();
  });
});
