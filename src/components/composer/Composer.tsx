import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Paperclip, Square } from 'lucide-react';
import { toast } from 'sonner';
import { useAttachmentDraft } from '@/store/attachmentDraftStore';
import { useModels } from '@/store/modelStore';
import { supportIssues } from '@/lib/attachments/support';
import { shortName } from '@/lib/modelName';
import { AttachmentChips } from './AttachmentChips';
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
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useAttachmentDraft((s) => s.pending);
  const rejected = useAttachmentDraft((s) => s.rejected);
  const addFiles = useAttachmentDraft((s) => s.add);
  const removeFile = useAttachmentDraft((s) => s.remove);
  const clearFiles = useAttachmentDraft((s) => s.clear);
  const dismissRejected = useAttachmentDraft((s) => s.dismissRejected);
  const modelId = useChat((s) => s.draftModelId);
  const draftMode = useChat((s) => s.draftMode);
  const draftLanes = useChat((s) => s.draftLanes);
  const byId = useModels((s) => s.byId);
  const compare = draftMode === 'compare';
  // Gate against every lane's model; the first blocking issue names its lane.
  const laneModelIds = compare ? draftLanes.map((l) => l.modelId) : [modelId];
  const issues = laneModelIds.flatMap((id, i) => {
    const m = byId.get(id);
    const name = m ? shortName(m.name) : id;
    return supportIssues(
      pending.map((p) => p.kind),
      m,
      compare ? `${name} (lane ${i + 1})` : name,
    );
  });
  const blocked = issues.some((i) => i.level === 'block');

  useEffect(() => {
    if (rejected.length === 0) return;
    for (const r of rejected) toast.error(`${r.name}: ${r.reason}`);
    dismissRejected();
  }, [rejected, dismissRejected]);

  useEffect(() => {
    ref.current?.focus();
  }, [activeChatId]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 72), 280)}px`;
  }, [text]);

  const canSend = (text.trim().length > 0 || pending.length > 0) && !blocked;

  const submit = () => {
    if (!canSend || streaming) return;
    const t = text;
    const files = pending;
    setText('');
    clearFiles();
    void send(t, files);
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length === 0) return;
    e.preventDefault();
    void addFiles(files);
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
        <AttachmentChips items={pending} issues={issues} onRemove={removeFile} />
        <Textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder="Message…"
          rows={1}
          className="max-h-[280px] min-h-[72px] resize-none rounded-none border-0 bg-transparent px-4 pt-3.5 pb-1 text-[15px] shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <div className="flex items-center gap-1 px-2.5 py-2.5">
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/*,.md,.json,.csv,.ts,.tsx,.js,.py,.rs,.go,.java,.yaml,.yml,.toml,.xml,.html,.css,.sql,.sh"
            onChange={(e) => {
              if (e.target.files?.length) void addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          {compare ? (
            <span className="text-muted-foreground px-2 text-xs">Sent to both models</span>
          ) : (
            <>
              <ModelPicker onOpenSettings={onOpenSettings} />
              <ThinkingLevel />
            </>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="Attach files"
              title="Attach files"
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className="size-4" />
            </Button>
            {streaming ? (
              <Button size="icon-sm" variant="secondary" onClick={stop} aria-label="Stop">
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon-sm"
                onClick={submit}
                disabled={!canSend}
                aria-label="Send"
                title={blocked ? issues.find((i) => i.level === 'block')?.message : undefined}
              >
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
