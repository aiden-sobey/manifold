import { useCallback, useRef, useState } from 'react';

export function useCopy(resetMs = 1500) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), resetMs);
      } catch {
        /* clipboard unavailable */
      }
    },
    [resetMs],
  );
  return { copied, copy };
}
