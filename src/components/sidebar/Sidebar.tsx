import { BarChart3, PanelLeftClose, Plus, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useChat } from '@/store/chatStore';
import { ChatListItem } from './ChatListItem';
import { SearchInput } from './SearchInput';
import { cn } from '@/lib/utils';
import { useWindowDrag } from '@/lib/useWindowDrag';
import { isMacDesktop } from '@/lib/platform';
import { MD_UP, useMediaQuery } from '@/lib/useMediaQuery';
import { useUi } from '@/store/uiStore';
import { BalanceBadge } from './BalanceBadge';

interface Props {
  open: boolean;
  onToggle: () => void;
  onOpenSettings: () => void;
}

export function Sidebar({ open, onToggle, onOpenSettings }: Props) {
  const chats = useChat((s) => s.chats);
  const activeChatId = useChat((s) => s.activeChatId);
  const searchQuery = useChat((s) => s.searchQuery);
  const searchResults = useChat((s) => s.searchResults);
  const newChat = useChat((s) => s.newChat);
  const openChat = useChat((s) => s.openChat);
  const deleteChat = useChat((s) => s.deleteChat);
  const renameChat = useChat((s) => s.renameChat);

  const searching = searchQuery.trim().length > 0;
  const onDrag = useWindowDrag();
  const view = useUi((s) => s.view);
  const showAnalytics = useUi((s) => s.showAnalytics);
  const mdUp = useMediaQuery(MD_UP);
  // Narrow screens: the sidebar is an overlay drawer, and picking anything closes it.
  const closeIfDrawer = () => {
    if (!mdUp && open) onToggle();
  };
  const open_ = (id: string) => {
    void openChat(id);
    closeIfDrawer();
  };

  return (
    <>
      {!mdUp && open ? (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onToggle}
          aria-hidden="true"
        />
      ) : null}
      <aside
        className={cn(
          'bg-sidebar text-sidebar-foreground border-sidebar-border flex h-full shrink-0 flex-col border-r',
          // Drawer below md, in-flow column at md and up.
          'fixed inset-y-0 left-0 z-40 w-[280px] transition-transform duration-200 md:static md:transition-[width]',
          'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] md:pt-0 md:pb-0',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          open ? 'md:w-[280px]' : 'md:w-0 md:overflow-hidden md:border-r-0',
        )}
      >
        {/* Title-bar strip: drag-to-move is a window affordance, not a control. */}
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div
          data-tauri-drag-region
          onMouseDown={onDrag}
          className={cn(
            'flex h-12 items-center justify-end gap-1 px-2',
            isMacDesktop && 'md:pl-20',
          )}
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    newChat();
                    closeIfDrawer();
                  }}
                  aria-label="New chat"
                />
              }
            >
              <Plus className="size-4" />
            </TooltipTrigger>
            <TooltipContent>New chat{mdUp ? ' ⌘N' : ''}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onToggle}
                  aria-label="Hide sidebar"
                />
              }
            >
              <PanelLeftClose className="size-4" />
            </TooltipTrigger>
            <TooltipContent>Hide sidebar{mdUp ? ' ⌘B' : ''}</TooltipContent>
          </Tooltip>
        </div>

        <div className="px-3 pb-2">
          <SearchInput />
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-0.5 px-2 pb-2">
            {searching ? (
              searchResults.length === 0 ? (
                <p className="text-muted-foreground px-2 py-6 text-center text-sm">No matches</p>
              ) : (
                searchResults.map((r) => (
                  <ChatListItem
                    key={r.chatId}
                    id={r.chatId}
                    title={r.title}
                    snippet={r.snippet}
                    active={r.chatId === activeChatId}
                    onOpen={() => open_(r.chatId)}
                    onDelete={() => void deleteChat(r.chatId)}
                    onRename={(t) => void renameChat(r.chatId, t)}
                  />
                ))
              )
            ) : chats.length === 0 ? (
              <p className="text-muted-foreground px-2 py-6 text-center text-sm">
                No chats yet. Start one below.
              </p>
            ) : (
              chats.map((c) => (
                <ChatListItem
                  key={c.id}
                  id={c.id}
                  title={c.title}
                  compare={c.mode === 'compare'}
                  active={c.id === activeChatId}
                  onOpen={() => open_(c.id)}
                  onDelete={() => void deleteChat(c.id)}
                  onRename={(t) => void renameChat(c.id, t)}
                />
              ))
            )}
          </div>
        </ScrollArea>

        <div className="border-sidebar-border flex items-end justify-between gap-2 border-t p-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className={cn('justify-start gap-2', view === 'analytics' && 'bg-sidebar-accent')}
              onClick={() => {
                showAnalytics();
                closeIfDrawer();
              }}
            >
              <BarChart3 className="size-4" /> Analytics
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-2"
              onClick={() => {
                onOpenSettings();
                closeIfDrawer();
              }}
            >
              <Settings className="size-4" /> Settings
            </Button>
          </div>
          <BalanceBadge onOpenSettings={onOpenSettings} />
        </div>
      </aside>
    </>
  );
}
