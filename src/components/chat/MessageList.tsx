import type { Message } from '@/types/domain';
import { MessageBubble } from './MessageBubble';

export function MessageList({ messages }: { messages: Message[] }) {
  return (
    <div className="flex flex-col gap-6">
      {messages.map((m, i) => (
        <MessageBubble key={m.id} message={m} isLast={i === messages.length - 1} />
      ))}
    </div>
  );
}
