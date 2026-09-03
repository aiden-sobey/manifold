import { useEffect, useRef } from 'react';
import { useChat } from '@/store/chatStore';
import { MessageList } from './MessageList';
import { useGreeting } from '@/store/greetingStore';

export function ChatView() {
  const messages = useChat((s) => s.messages);
  const activeChatId = useChat((s) => s.activeChatId);
  const greeting = useGreeting((s) => s.current);
  const nextGreeting = useGreeting((s) => s.next);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  const last = messages[messages.length - 1];
  const lastLen = (last?.content.length ?? 0) + (last?.reasoning?.length ?? 0);
  // Id of the most recent user message: changes exactly when the user sends something.
  const lastUserId = [...messages].reverse().find((m) => m.role === 'user')?.id;

  useEffect(() => {
    pinned.current = true;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [activeChatId]);

  // Sending a message always re-pins and jumps to the bottom, even if the user had scrolled up.
  useEffect(() => {
    if (!lastUserId) return;
    pinned.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastUserId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, lastLen]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // Each new empty state shows the next greeting in today's rotation.
  const empty = messages.length === 0;
  useEffect(() => {
    if (empty && activeChatId === null) void nextGreeting();
  }, [empty, activeChatId, nextGreeting]);

  if (empty) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{greeting.heading}</h1>
        <p className="text-muted-foreground max-w-md text-sm">{greeting.subtext}</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <MessageList messages={messages} />
      </div>
    </div>
  );
}
