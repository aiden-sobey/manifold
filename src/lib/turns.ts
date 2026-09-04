import type { Message } from '@/types/domain';

export interface Turn {
  user: Message;
  /** Replies keyed by lane. Single-mode replies (lane null) are stored under lane 0. */
  replies: Map<number, Message>;
}

/** Groups a transcript into turns: each user message followed by the replies that answer it. */
export function groupTurns(messages: Message[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;
  for (const m of messages) {
    if (m.role === 'user') {
      current = { user: m, replies: new Map() };
      turns.push(current);
    } else if (current) {
      current.replies.set(m.lane ?? 0, m);
    }
  }
  return turns;
}

/**
 * The messages a given lane's model should see: every user message plus that lane's own replies.
 * Single mode passes lane null and sees replies with lane null.
 */
export function historyForLane(messages: Message[], lane: number | null): Message[] {
  return messages.filter((m) => m.role === 'user' || (m.lane ?? null) === lane);
}

/** Last reply for a lane, if any. */
export function lastReplyForLane(messages: Message[], lane: number | null): Message | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === 'user') return undefined;
    if ((m.lane ?? null) === lane) return m;
  }
  return undefined;
}
