import { isValidElement, useRef, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCopy } from '@/lib/useCopy';

function languageOf(children: ReactNode): string | null {
  if (!isValidElement<{ className?: string }>(children)) return null;
  const m = /language-([\w+-]+)/.exec(children.props.className ?? '');
  return m?.[1] ?? null;
}

export function CodeBlock({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const { copied, copy } = useCopy();
  const lang = languageOf(children);

  return (
    <div className="bg-muted/60 border-border my-3 overflow-hidden rounded-lg border">
      <div className="border-border text-muted-foreground flex h-8 items-center justify-between border-b px-3 text-xs">
        <span className="font-mono">{lang ?? 'text'}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Copy code"
          onClick={() => void copy(ref.current?.innerText ?? '')}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      </div>
      <pre ref={ref}>{children}</pre>
    </div>
  );
}
