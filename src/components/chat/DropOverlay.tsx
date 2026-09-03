import { useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import { useAttachmentDraft } from '@/store/attachmentDraftStore';
import { useUi } from '@/store/uiStore';

/** Window-wide drop target. Tauri's native drop handler is disabled so HTML5 events reach us. */
export function DropOverlay() {
  const [active, setActive] = useState(false);
  const add = useAttachmentDraft((s) => s.add);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setActive(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setActive(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setActive(false);
      const files = e.dataTransfer?.files;
      if (files?.length) {
        useUi.getState().showChat();
        void add(files);
      }
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [add]);

  if (!active) return null;
  return (
    <div className="bg-background/80 pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
      <div className="border-primary/60 text-foreground flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed">
        <Upload className="size-8" />
        <div className="text-lg font-medium">Drop files to attach</div>
        <div className="text-muted-foreground text-sm">Images, PDFs, text and code files</div>
      </div>
    </div>
  );
}
