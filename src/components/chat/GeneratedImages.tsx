import { useEffect, useState } from 'react';
import { Copy, Download, Loader2, Pencil } from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { readAttachmentBytes } from '@/lib/attachments/storage';
import { isMobile } from '@/lib/platform';
import { useAttachmentSrc } from '@/lib/useAttachmentSrc';
import { cn } from '@/lib/utils';
import { useAttachmentDraft } from '@/store/attachmentDraftStore';
import { useChat } from '@/store/chatStore';
import type { Attachment } from '@/types/domain';

const gridClass = (n: number) => cn('grid gap-2', n > 1 && 'max-w-xl grid-cols-2');

/** Attaches the image to the next prompt as a reference, and switches the composer to images. */
async function editImage(a: Attachment) {
  try {
    const bytes = await readAttachmentBytes(a);
    await useAttachmentDraft.getState().add([new File([bytes], a.name, { type: a.mime })]);
    await useChat.getState().setDraftKind('image');
  } catch (e) {
    toast.error(e instanceof Error ? e.message : String(e));
  }
}

async function pngBlob(a: Attachment): Promise<Blob> {
  const blob = new Blob([await readAttachmentBytes(a)], { type: a.mime });
  if (a.mime === 'image/png') return blob;
  // The clipboard only reliably takes PNG.
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))),
      'image/png',
    ),
  );
}

async function copyImage(a: Attachment) {
  try {
    // WebKit wants the ClipboardItem created within the click, with its data as a promise.
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob(a) })]);
    toast.success('Copied image');
  } catch (e) {
    toast.error(`Could not copy the image: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function saveImage(a: Attachment) {
  try {
    const ext = a.relPath.slice(a.relPath.lastIndexOf('.') + 1);
    const path = await save({
      defaultPath: a.name,
      filters: [{ name: 'Image', extensions: [ext] }],
    });
    if (!path) return;
    await writeFile(path, await readAttachmentBytes(a));
    toast.success('Saved image');
  } catch (e) {
    toast.error(e instanceof Error ? e.message : String(e));
  }
}

function Tile({ a, single, onOpen }: { a: Attachment; single: boolean; onOpen: () => void }) {
  const src = useAttachmentSrc(a.relPath);
  const ratio = a.width && a.height ? a.width / a.height : 1;
  const action = 'bg-background/80 hover:bg-background backdrop-blur';
  return (
    <div
      className="group/image bg-muted relative overflow-hidden rounded-xl"
      // A lone image is at most 28rem wide and 32rem tall, keeping its shape.
      style={{
        aspectRatio: ratio,
        width: single ? `min(100%, 28rem, ${32 * ratio}rem)` : undefined,
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="h-full w-full"
        aria-label={`Open ${a.name}`}
      >
        {src ? <img src={src} alt={a.name} className="h-full w-full object-cover" /> : null}
      </button>
      <div className="absolute right-1.5 bottom-1.5 flex gap-1 opacity-0 transition-opacity group-hover/image:opacity-100 pointer-coarse:opacity-100">
        <Button
          variant="ghost"
          size="icon-xs"
          className={action}
          aria-label="Edit this image"
          title="Edit: attach to your next prompt"
          onClick={() => void editImage(a)}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className={action}
          aria-label="Copy image"
          title="Copy"
          onClick={() => void copyImage(a)}
        >
          <Copy className="size-3.5" />
        </Button>
        {isMobile ? null : (
          <Button
            variant="ghost"
            size="icon-xs"
            className={action}
            aria-label="Save image"
            title="Save…"
            onClick={() => void saveImage(a)}
          >
            <Download className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Images an image model made for a reply. Click to view full size. */
export function GeneratedImages({ items }: { items: Attachment[] }) {
  const [open, setOpen] = useState<Attachment | null>(null);
  const openSrc = useAttachmentSrc(open?.relPath ?? '');
  return (
    <>
      <div className={gridClass(items.length)}>
        {items.map((a) => (
          <Tile key={a.id} a={a} single={items.length === 1} onOpen={() => setOpen(a)} />
        ))}
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

/** Placeholder tiles while images generate, with the time so far. */
export function PendingImages({ count, since }: { count: number; since: number }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((now - since) / 1000));
  return (
    <div className={gridClass(count)} role="status">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={cn(
            'bg-muted flex aspect-square animate-pulse items-center justify-center rounded-xl',
            count === 1 && 'w-[min(100%,28rem)]',
          )}
        >
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Loader2 className="size-3.5 animate-spin" /> Generating… {seconds}s
          </span>
        </div>
      ))}
    </div>
  );
}
