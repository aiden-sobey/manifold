import { useEffect, useState } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { ChatView } from '@/components/chat/ChatView';
import { Composer } from '@/components/composer/Composer';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { pickDefaultModel, useChat } from '@/store/chatStore';
import { useModels } from '@/store/modelStore';
import { useSettings } from '@/store/settingsStore';
import { getApiKey } from '@/lib/keychain';
import { toast } from 'sonner';

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [needsKey, setNeedsKey] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const loaded = useChat((s) => s.loaded);

  useEffect(() => {
    void (async () => {
      try {
        await useSettings.getState().init();
        await Promise.all([useChat.getState().init(), useModels.getState().init()]);
        // Models may have arrived after the chat store picked its default; re-pick for a fresh chat.
        if (!useChat.getState().activeChatId) {
          useChat.setState({ draftModelId: pickDefaultModel() });
        }
        const key = await getApiKey();
        if (!key) {
          setNeedsKey(true);
          setSettingsOpen(true);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === 'n') {
        e.preventDefault();
        useChat.getState().newChat();
      } else if (e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
      } else if (e.key === 'k') {
        e.preventDefault();
        document.getElementById('chat-search')?.focus();
      } else if (e.key === 'b') {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <TooltipProvider>
      <div className="flex h-full w-full">
        <Sidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((v) => !v)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <main className="relative flex min-w-0 flex-1 flex-col">
          <ChatHeader sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((v) => !v)} />
          {loaded ? (
            <>
              <ChatView />
              <Composer onOpenSettings={() => setSettingsOpen(true)} />
            </>
          ) : (
            <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
              Loading…
            </div>
          )}
        </main>
      </div>
      <SettingsDialog
        open={settingsOpen}
        required={needsKey}
        onOpenChange={(o) => {
          if (!o && needsKey) return;
          setSettingsOpen(o);
        }}
        onKeySaved={() => {
          setNeedsKey(false);
          setSettingsOpen(false);
        }}
      />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
