import { memo, useMemo } from 'react';
import { AlertCircle, Check, Copy, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChat } from '@/store/chatStore';
import { useModels } from '@/store/modelStore';
import type { Message } from '@/types/domain';
import { Markdown } from './Markdown';
import { ReasoningBlock } from './ReasoningBlock';
import { MessageAttachments } from './MessageAttachments';
import { useCopy } from '@/lib/useCopy';
import { chatCost, formatCost, formatTokens, messageCost } from '@/lib/cost';

interface Props {
  message: Message;
  isLast: boolean;
}

export const MessageBubble = memo(function MessageBubble({ message, isLast }: Props) {
  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-2">
        {message.attachments?.length ? <MessageAttachments items={message.attachments} /> : null}
        {message.content ? (
          <div className="bg-muted max-w-[80%] rounded-2xl px-4 py-2.5 text-[15px] leading-7 whitespace-pre-wrap">
            {message.content}
          </div>
        ) : null}
      </div>
    );
  }
  return <AssistantBubble message={message} isLast={isLast} />;
});

function AssistantBubble({ message, isLast }: Props) {
  const streaming = useChat((s) => s.streaming);
  const regenerate = useChat((s) => s.regenerate);
  const model = useModels((s) => (message.modelId ? s.byId.get(message.modelId) : undefined));
  const modelName = model?.name ?? message.modelId;
  const cost = messageCost(message, model);
  // Select stable references only; derive the total with useMemo. Returning a fresh
  // object from a Zustand selector re-renders forever.
  const messages = useChat((s) => s.messages);
  const byId = useModels((s) => s.byId);
  const total = useMemo(() => (isLast ? chatCost(messages, byId) : null), [isLast, messages, byId]);
  const { copied, copy } = useCopy();

  const showCursor = message.streaming && !message.content && !message.reasoning;

  return (
    <div className="group flex flex-col gap-2">
      {message.reasoning ? (
        <ReasoningBlock
          text={message.reasoning}
          streaming={Boolean(message.streaming) && !message.content}
        />
      ) : null}

      {message.content ? (
        <Markdown content={message.content} />
      ) : showCursor ? (
        <span className="bg-foreground/70 animate-blink inline-block h-4 w-2 rounded-sm" />
      ) : null}

      {message.error ? (
        <div className="text-destructive flex items-start gap-2 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{message.error}</span>
        </div>
      ) : null}
      {message.finishReason === 'aborted' && !message.error ? (
        <div className="text-muted-foreground text-xs italic">Stopped.</div>
      ) : null}

      {!message.streaming && (
        <div className="text-muted-foreground flex h-6 items-center gap-1 text-xs">
          {/* Default: running total for the whole conversation, on the last message only. */}
          {total ? (
            <span
              className="truncate group-hover:hidden"
              title={
                total.exact
                  ? 'Total charged by OpenRouter for this conversation'
                  : 'Includes estimates from list price for some messages'
              }
            >
              {formatTokens(total.tokens)} tokens · {formatCost(total)}
            </span>
          ) : null}
          {/* Hover: this message's model, tokens and cost. */}
          <span className="hidden min-w-0 items-center truncate group-hover:flex">
            <span className="truncate">{modelName}</span>
            {message.usage?.total_tokens ? (
              <span className="before:mx-1.5 before:content-['·']">
                {formatTokens(message.usage.total_tokens)} tokens
              </span>
            ) : null}
            {cost ? (
              <span
                className="before:mx-1.5 before:content-['·']"
                title={cost.exact ? 'Charged by OpenRouter' : 'Estimated from list price'}
              >
                {formatCost(cost)}
              </span>
            ) : null}
          </span>
          <span className="ml-auto flex items-center opacity-0 transition-opacity group-hover:opacity-100">
            {message.content ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Copy message"
                onClick={() => void copy(message.content)}
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </Button>
            ) : null}
            {isLast ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Regenerate"
                disabled={streaming}
                onClick={() => void regenerate()}
              >
                <RefreshCw className="size-3.5" />
              </Button>
            ) : null}
          </span>
        </div>
      )}
    </div>
  );
}
