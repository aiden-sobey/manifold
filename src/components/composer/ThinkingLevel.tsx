import { Brain, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LEVEL_LABELS, availableLevels } from '@/lib/openrouter/reasoning';
import { useChat } from '@/store/chatStore';
import { useModels } from '@/store/modelStore';
import type { ThinkingLevel as Level } from '@/types/domain';

export function ThinkingLevel() {
  const modelId = useChat((s) => s.draftModelId);
  const level = useChat((s) => s.draftThinking);
  const setLevel = useChat((s) => s.setDraftThinking);
  const model = useModels((s) => s.byId.get(modelId));
  const levels = availableLevels(model);

  if (levels.length === 0) return null;
  const effective = levels.includes(level) ? level : 'default';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground gap-1.5"
            aria-label="Thinking level"
            title="Thinking level"
          />
        }
      >
        <Brain className="size-4" />
        <span>{LEVEL_LABELS[effective]}</span>
        <ChevronDown className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={effective} onValueChange={(v) => void setLevel(v as Level)}>
          {levels.map((l) => (
            <DropdownMenuRadioItem key={l} value={l}>
              {LEVEL_LABELS[l]}
              {l === 'default' && model?.reasoning?.default_effort
                ? ` (${model.reasoning.default_effort})`
                : ''}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
