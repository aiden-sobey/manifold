import { Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChat } from '@/store/chatStore';
import { cn } from '@/lib/utils';

/** Switches this chat between replies from a chat model and images from an image model. */
export function ImageToggle() {
  const enabled = useChat((s) => s.draftKind === 'image');
  const setDraftKind = useChat((s) => s.setDraftKind);
  const label = enabled ? 'Image generation on' : 'Image generation off';

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('gap-1.5', enabled ? 'bg-muted text-foreground' : 'text-muted-foreground')}
      aria-pressed={enabled}
      aria-label={label}
      title={`${label}: send prompts to an image model`}
      onClick={() => void setDraftKind(enabled ? 'chat' : 'image')}
    >
      <ImageIcon className="size-4" />
      <span className="hidden sm:inline">Image</span>
    </Button>
  );
}
