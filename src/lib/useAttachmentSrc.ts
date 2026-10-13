import { useEffect, useState } from 'react';
import { attachmentSrc } from '@/lib/attachments/storage';

/** Asset-protocol URL for a stored attachment, once resolved. */
export function useAttachmentSrc(relPath: string): string | null {
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
