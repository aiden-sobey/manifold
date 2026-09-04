import { useEffect, useRef, useState } from 'react';
import { Columns2, MoreHorizontal, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ModelPicker } from '@/components/composer/ModelPicker';
import { ThinkingLevel } from '@/components/composer/ThinkingLevel';
import { chatCost, formatCost, formatTokens } from '@/lib/cost';
import { shortName } from '@/lib/modelName';
import { groupTurns, type Turn } from '@/lib/turns';
import { useWindowDrag } from '@/lib/useWindowDrag';
import { isMacDesktop } from '@/lib/platform';
import { MD_UP, useMediaQuery } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';
import { useChat } from '@/store/chatStore';
import { useGreeting } from '@/store/greetingStore';
import { useModels } from '@/store/modelStore';
import type { Message } from '@/types/domain';
import { MessageAttachments } from './MessageAttachments';
import { MessageBubble } from './MessageBubble';

interface Props {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function CompareView({ sidebarOpen, onToggleSidebar }: Props) {
  const messages = useChat((s) => s.messages);
  const activeChatId = useChat((s) => s.activeChatId);
  const lanes = useChat((s) => s.draftLanes);
  const title = useChat((s) => s.chats.find((c) => c.id === s.activeChatId)?.title);
  const exitCompare = useChat((s) => s.exitCompareMode);
  const byIdName = useModels((s) => s.byId);
  const greeting = useGreeting((s) => s.current);
  const onDrag = useWindowDrag();
  const mdUp = useMediaQuery(MD_UP);
  // Below md only one lane is visible at a time; both keep streaming in the store.
  const [activeLane, setActiveLane] = useState(0);
  const visibleLanes = mdUp ? lanes.map((_, i) => i) : [Math.min(activeLane, lanes.length - 1)];
  const turns = groupTurns(messages);
  const empty = messages.length === 0;
  const lastLen = messages.reduce((n, m) => n + m.content.length + (m.reasoning?.length ?? 0), 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <header
        data-tauri-drag-region
        onMouseDown={onDrag}
        className={cn(
          'grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-3',
          isMacDesktop && !sidebarOpen && 'pl-20',
        )}
      >
        <div className="flex items-center gap-2">
          {(!sidebarOpen || !mdUp) && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleSidebar}
              aria-label="Show sidebar"
            >
              <PanelLeftOpen className="size-4" />
            </Button>
          )}
        </div>
        <span className="text-muted-foreground pointer-events-none flex items-center gap-1.5 truncate text-sm select-none">
          <Columns2 className="size-3.5" />
          {title ?? 'New comparison'}
        </span>
        <div className="flex justify-end">
          {empty && activeChatId === null ? (
            <Button variant="ghost" size="sm" onClick={exitCompare}>
              Exit comparison
            </Button>
          ) : null}
        </div>
      </header>

      {!mdUp ? (
        <div className="border-border flex shrink-0 gap-1 border-b px-3 pb-1.5">
          {lanes.map((l, i) => (
            <Button
              key={i}
              variant={i === visibleLanes[0] ? 'secondary' : 'ghost'}
              size="sm"
              className="min-w-0 flex-1 justify-center"
              onClick={() => setActiveLane(i)}
            >
              <span className="truncate">{laneLabel(l.modelId, byIdName)}</span>
            </Button>
          ))}
        </div>
      ) : null}
      <div className="border-border divide-border grid shrink-0 grid-cols-1 divide-x border-b md:grid-cols-2">
        {visibleLanes.map((i) => (
          <LaneHeader key={i} lane={i} messages={messages} />
        ))}
      </div>

      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{greeting.heading}</h1>
          <p className="text-muted-foreground max-w-md text-sm">
            Pick a model for each side above. Your message goes to both.
          </p>
        </div>
      ) : (
        <div className="divide-border grid min-h-0 flex-1 grid-cols-1 divide-x md:grid-cols-2">
          {visibleLanes.map((lane) => (
            <LaneColumn key={lane} lane={lane} turns={turns} lastLen={lastLen} />
          ))}
        </div>
      )}
    </div>
  );
}

function laneLabel(modelId: string, byId: Map<string, { name: string }>): string {
  const m = byId.get(modelId);
  return m ? shortName(m.name) : modelId;
}

/** One independently scrolling column: each turn's prompt (compact) followed by this lane's reply. */
function LaneColumn({ lane, turns, lastLen }: { lane: number; turns: Turn[]; lastLen: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const lastUserId = turns[turns.length - 1]?.user.id;

  useEffect(() => {
    pinned.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastUserId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [lastLen]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  return (
    <div ref={scrollRef} onScroll={onScroll} className="min-h-0 min-w-0 overflow-y-auto">
      <div className="flex flex-col gap-6 px-5 py-5">
        {turns.map((t, idx) => {
          const reply = t.replies.get(lane);
          return (
            <div key={t.user.id} className="flex flex-col gap-3">
              <div className="flex flex-col items-end gap-2">
                {t.user.attachments?.length ? (
                  <MessageAttachments items={t.user.attachments} />
                ) : null}
                {t.user.content ? (
                  <div className="bg-muted max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-6 whitespace-pre-wrap">
                    {t.user.content}
                  </div>
                ) : null}
              </div>
              {reply ? (
                <MessageBubble message={reply} isLast={idx === turns.length - 1} compare />
              ) : (
                <div className="text-muted-foreground text-sm italic">No answer</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LaneHeader({ lane, messages }: { lane: number; messages: Message[] }) {
  const byId = useModels((s) => s.byId);
  const laneState = useChat((s) => s.draftLanes[lane]);
  const activeChatId = useChat((s) => s.activeChatId);
  const streaming = useChat((s) => s.streaming);
  const continueWithLane = useChat((s) => s.continueWithLane);
  const [confirm, setConfirm] = useState(false);

  const laneMessages = messages.filter((m) => m.role === 'assistant' && (m.lane ?? 0) === lane);
  const total = chatCost(laneMessages, byId);
  const name = laneState ? (byId.get(laneState.modelId)?.name ?? laneState.modelId) : '';
  const other = useChat((s) => s.draftLanes.find((_, i) => i !== lane));
  const otherName = other ? (byId.get(other.modelId)?.name ?? other.modelId) : '';

  return (
    <div className="flex min-w-0 items-center gap-1 px-3 py-1.5">
      <ModelPicker onOpenSettings={() => undefined} lane={lane} />
      <ThinkingLevel lane={lane} />
      <div className="ml-auto flex items-center gap-1">
        {total ? (
          <span className="text-muted-foreground hidden text-xs tabular-nums lg:inline">
            {formatTokens(total.tokens)} tok · {formatCost(total)}
          </span>
        ) : null}
        {activeChatId ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-xs" aria-label="Lane actions" />}
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={streaming} onClick={() => setConfirm(true)}>
                Continue with this model
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Continue with {shortName(name)}?</DialogTitle>
            <DialogDescription>
              This keeps {shortName(name)}&apos;s answers and removes {shortName(otherName)}&apos;s
              from the chat. Spend already recorded stays in Analytics.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirm(false);
                void continueWithLane(lane);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
