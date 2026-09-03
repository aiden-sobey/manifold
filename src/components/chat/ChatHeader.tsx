import { PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChat } from '@/store/chatStore';
import { cn } from '@/lib/utils';
import { useWindowDrag } from '@/lib/useWindowDrag';

interface Props {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function ChatHeader({ sidebarOpen, onToggleSidebar }: Props) {
  const title = useChat((s) => s.chats.find((c) => c.id === s.activeChatId)?.title);
  const onDrag = useWindowDrag();
  return (
    // Title-bar strip: drag-to-move is a window affordance, not a control.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <header
      data-tauri-drag-region
      onMouseDown={onDrag}
      className={cn('flex h-12 shrink-0 items-center gap-2 px-3', !sidebarOpen && 'pl-20')}
    >
      {!sidebarOpen && (
        <Button variant="ghost" size="icon-sm" onClick={onToggleSidebar} aria-label="Show sidebar">
          <PanelLeftOpen className="size-4" />
        </Button>
      )}
      <span className="text-muted-foreground pointer-events-none truncate text-sm select-none">
        {title ?? 'New chat'}
      </span>
    </header>
  );
}
