import { FileText, FileType2, X } from 'lucide-react';
import type { SupportIssue } from '@/lib/attachments/support';
import { formatBytes } from '@/lib/attachments/kinds';
import { cn } from '@/lib/utils';
import type { PendingAttachment } from '@/store/attachmentDraftStore';

interface Props {
  items: PendingAttachment[];
  issues: SupportIssue[];
  onRemove: (id: string) => void;
}

export function AttachmentChips({ items, issues, onRemove }: Props) {
  if (items.length === 0) return null;
  const issueFor = (kind: PendingAttachment['kind']) => issues.find((i) => i.kind === kind);
  return (
    <div className="flex flex-wrap gap-2 px-3 pt-3">
      {items.map((a) => {
        const issue = issueFor(a.kind);
        return (
          <div
            key={a.id}
            title={issue?.message ?? `${a.name} · ${formatBytes(a.size)}`}
            className={cn(
              'group/chip bg-muted/60 relative flex items-center gap-2 rounded-lg border p-1.5 pr-7 text-xs',
              issue?.level === 'block'
                ? 'border-amber-500/70'
                : issue?.level === 'note'
                  ? 'border-amber-500/30'
                  : 'border-border',
            )}
          >
            {a.kind === 'image' && a.previewUrl ? (
              <img
                src={a.previewUrl}
                alt=""
                className="size-10 rounded-md object-cover"
                width={40}
                height={40}
              />
            ) : (
              <span className="bg-background flex size-10 items-center justify-center rounded-md">
                {a.kind === 'pdf' ? (
                  <FileType2 className="text-muted-foreground size-5" />
                ) : (
                  <FileText className="text-muted-foreground size-5" />
                )}
              </span>
            )}
            <div className="max-w-[160px] min-w-0">
              <div className="truncate font-medium">{a.name}</div>
              <div className="text-muted-foreground truncate">
                {issue ? (
                  <span className={issue.level === 'block' ? 'text-amber-500' : undefined}>
                    {issue.level === 'block' ? 'Not supported by this model' : 'Converted to text'}
                  </span>
                ) : (
                  <>
                    {a.kind === 'image' && a.width ? `${a.width}×${a.height} · ` : ''}
                    {formatBytes(a.size)}
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              aria-label={`Remove ${a.name}`}
              onClick={() => onRemove(a.id)}
              className="text-muted-foreground hover:text-foreground absolute top-1 right-1 rounded p-0.5"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
