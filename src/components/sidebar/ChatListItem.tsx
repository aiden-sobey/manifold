import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface Props {
  id: string;
  title: string;
  snippet?: string | null;
  active: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}

export function ChatListItem({ title, snippet, active, onOpen, onDelete, onRename }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== title) onRename(draft);
    else setDraft(title);
  };

  return (
    <div
      className={cn(
        'group relative flex items-start rounded-md text-sm transition-colors',
        active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/60',
      )}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft(title);
              setEditing(false);
            }
          }}
          className="bg-background ring-ring m-1 w-full rounded px-2 py-1 text-sm ring-1 outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={onOpen}
          onDoubleClick={() => setEditing(true)}
          className="min-w-0 flex-1 px-2.5 py-2 text-left"
        >
          <div className="truncate">{title}</div>
          {snippet ? (
            <div className="text-muted-foreground mt-0.5 truncate text-xs">{snippet}</div>
          ) : null}
        </button>
      )}
      {!editing && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Chat actions"
                className={cn(
                  'mt-1.5 mr-1 opacity-0 group-hover:opacity-100 data-[popup-open]:opacity-100',
                  active && 'opacity-100',
                )}
              />
            }
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                if (confirm(`Delete "${title}"?`)) onDelete();
              }}
            >
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
