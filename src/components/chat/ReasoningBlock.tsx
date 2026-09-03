import { useState } from 'react';
import { Brain, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface Props {
  text: string;
  /** True while only reasoning has arrived (no answer yet). */
  streaming: boolean;
}

export function ReasoningBlock({ text, streaming }: Props) {
  // Always collapsed until the user opens it.
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs">
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        <Brain className="size-3.5" />
        <span>{streaming ? 'Thinking…' : 'Thought process'}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-border text-muted-foreground mt-2 max-h-72 overflow-y-auto border-l-2 pl-3 text-[13px] leading-6 whitespace-pre-wrap">
          {text}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
