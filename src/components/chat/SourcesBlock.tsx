import { useState } from 'react';
import { ChevronRight, Globe } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { sourceHost } from '@/lib/openrouter/webTools';
import { cn } from '@/lib/utils';
import type { Citation } from '@/types/domain';

interface Props {
  citations: Citation[];
  /** Searches the model ran, from usage. Unknown while streaming. */
  searches: number;
}

export function SourcesBlock({ citations, searches }: Props) {
  const [open, setOpen] = useState(false);
  const parts = [
    searches > 0 ? `Searched the web${searches > 1 ? ` ${searches} times` : ''}` : null,
    citations.length ? `${citations.length} source${citations.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean);

  if (citations.length === 0) {
    return (
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Globe className="size-3.5" />
        <span>{parts.join(' · ')}</span>
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs">
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        <Globe className="size-3.5" />
        <span>{parts.join(' · ')}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="border-border mt-2 flex flex-col gap-1.5 border-l-2 pl-3 text-[13px]">
          {citations.map((c) => (
            <li key={c.url} className="flex min-w-0 items-baseline gap-2">
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="text-foreground truncate hover:underline"
              >
                {c.title ?? sourceHost(c.url)}
              </a>
              <span className="text-muted-foreground shrink-0 text-xs">{sourceHost(c.url)}</span>
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}
