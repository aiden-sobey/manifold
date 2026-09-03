import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useChat } from '@/store/chatStore';
import { useSettings } from '@/store/settingsStore';
import { ModelPicker } from './ModelPicker';
import { ThinkingLevel } from './ThinkingLevel';

export function Composer({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [text, setText] = useState('');
  const streaming = useChat((s) => s.streaming);
  const send = useChat((s) => s.send);
  const stop = useChat((s) => s.stop);
  const activeChatId = useChat((s) => s.activeChatId);
  const sendKey = useSettings((s) => s.settings.sendKey);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, [activeChatId]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 72), 280)}px`;
  }, [text]);

  const submit = () => {
    if (!text.trim() || streaming) return;
    const t = text;
    setText('');
    void send(t);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return;
    const mod = e.metaKey || e.ctrlKey;
    if (sendKey === 'enter' && !e.shiftKey && !mod) {
      e.preventDefault();
      submit();
    } else if (sendKey === 'mod-enter' && mod) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="shrink-0 px-4 pb-4">
      <div className="bg-card border-border focus-within:ring-ring/30 mx-auto w-full max-w-3xl rounded-2xl border shadow-sm focus-within:ring-2">
        <Textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message…"
          rows={1}
          className="max-h-[280px] min-h-[72px] resize-none rounded-none border-0 bg-transparent px-4 pt-3.5 pb-1 text-[15px] shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <div className="flex items-center gap-1 px-2.5 py-2.5">
          <ModelPicker onOpenSettings={onOpenSettings} />
          <ThinkingLevel />
          <div className="ml-auto">
            {streaming ? (
              <Button size="icon-sm" variant="secondary" onClick={stop} aria-label="Stop">
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button size="icon-sm" onClick={submit} disabled={!text.trim()} aria-label="Send">
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
