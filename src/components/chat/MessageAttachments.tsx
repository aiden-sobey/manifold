import { useEffect, useState } from 'react';
import { FileText, FileType2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { formatBytes } from '@/lib/attachments/kinds';
import { attachmentSrc } from '@/lib/attachments/storage';
import type { Attachment } from '@/types/domain';

function useSrc(relPath: string): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void attachmentSrc(relPath).then((u) => {
      if (alive) setSrc(u);
    });
    return () => {
      alive = false;
    };
  }, [relPath]);
  return src;
}

function ImageThumb({ a, onOpen }: { a: Attachment; onOpen: () => void }) {
  const src = useSrc(a.relPath);
  const ratio = a.width && a.height ? a.width / a.height : 1;
  const h = 200;
  const w = Math.min(320, Math.round(h * ratio));
  return (
    <button
      type="button"
      onClick={onOpen}
      className="bg-muted overflow-hidden rounded-xl"
      style={{ width: w, height: h }}
      aria-label={`Open ${a.name}`}
    >
      {src ? <img src={src} alt={a.name} className="h-full w-full object-cover" /> : null}
    </button>
  );
}

function FileCard({ a }: { a: Attachment }) {
  return (
    <div className="bg-muted flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm">
      <span className="bg-background flex size-9 items-center justify-center rounded-md">
        {a.kind === 'pdf' ? (
          <FileType2 className="text-muted-foreground size-4" />
        ) : (
          <FileText className="text-muted-foreground size-4" />
        )}
      </span>
      <div className="min-w-0">
        <div className="max-w-[220px] truncate font-medium">{a.name}</div>
        <div className="text-muted-foreground text-xs">
          {a.kind === 'pdf' ? 'PDF' : 'Text'} · {formatBytes(a.size)}
        </div>
      </div>
    </div>
  );
}

export function MessageAttachments({ items }: { items: Attachment[] }) {
  const [open, setOpen] = useState<Attachment | null>(null);
  const openSrc = useSrc(open?.relPath ?? '');
  return (
    <>
      <div className="flex max-w-[80%] flex-wrap justify-end gap-2">
        {items.map((a) =>
          a.kind === 'image' ? (
            <ImageThumb key={a.id} a={a} onOpen={() => setOpen(a)} />
          ) : (
            <FileCard key={a.id} a={a} />
          ),
        )}
      </div>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-[90vw] p-2 sm:max-w-[90vw]">
          <DialogTitle className="sr-only">{open?.name}</DialogTitle>
          {open && openSrc ? (
            <img
              src={openSrc}
              alt={open.name}
              className="max-h-[85vh] w-auto max-w-full rounded-lg object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
