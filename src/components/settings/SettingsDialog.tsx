import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getApiKey, setApiKey } from '@/lib/keychain';
import { checkApiKey } from '@/lib/openrouter/client';
import { useModels } from '@/store/modelStore';
import { useSettings, type SendKey } from '@/store/settingsStore';
import { pickDefaultModel, useChat } from '@/store/chatStore';
import { LEVEL_LABELS } from '@/lib/openrouter/reasoning';
import { THINKING_LEVELS, type ThinkingLevel } from '@/types/domain';

interface Props {
  open: boolean;
  required: boolean;
  onOpenChange: (open: boolean) => void;
  onKeySaved: () => void;
}

export function SettingsDialog({ open, required, onOpenChange, onKeySaved }: Props) {
  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const byId = useModels((s) => s.byId);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (!open) return;
    void getApiKey().then((k) => {
      setHasKey(Boolean(k));
      setKey('');
    });
  }, [open]);

  const saveKey = async () => {
    const k = key.trim();
    if (!k) return;
    setSaving(true);
    try {
      await setApiKey(k);
      setHasKey(true);
      setKey('');
      toast.success('API key saved to keychain');
      if (!useChat.getState().draftModelId) {
        useChat.setState({ draftModelId: pickDefaultModel() });
      }
      onKeySaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const testKey = async () => {
    const k = key.trim() || (await getApiKey()) || '';
    if (!k) return;
    setTesting(true);
    try {
      const info = await checkApiKey(k);
      toast.success(`Key works${info.label ? ` (${info.label})` : ''}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  const removeKey = async () => {
    await setApiKey('');
    setHasKey(false);
    toast('API key removed');
  };

  const modelLabel = (id: string) => byId.get(id)?.name ?? id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!required}>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            {required
              ? 'Add your OpenRouter API key to get started. It is stored in the macOS keychain.'
              : 'Keys, defaults and appearance.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <label htmlFor="api-key" className="text-sm font-medium">
              OpenRouter API key
            </label>
            <div className="flex gap-2">
              <Input
                id="api-key"
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={hasKey ? '•••••••• (saved)' : 'sk-or-v1-…'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveKey();
                }}
              />
              <Button onClick={() => void saveKey()} disabled={!key.trim() || saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : 'Save'}
              </Button>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Button
                variant="ghost"
                size="xs"
                disabled={testing || (!key.trim() && !hasKey)}
                onClick={() => void testKey()}
              >
                {testing ? <Loader2 className="size-3 animate-spin" /> : 'Test key'}
              </Button>
              {hasKey && (
                <Button variant="ghost" size="xs" onClick={() => void removeKey()}>
                  Remove key
                </Button>
              )}
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1"
                onClick={() => void openUrl('https://openrouter.ai/settings/keys')}
              >
                Get a key <ExternalLink className="size-3" />
              </button>
            </div>
          </section>

          {!required && (
            <>
              <section className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 text-sm">
                <div>
                  <div className="font-medium">Fallback model</div>
                  <div className="text-muted-foreground text-xs">
                    New chats use your last model, then the cheapest favourite, then this.
                  </div>
                </div>
                <ModelSelect
                  value={settings.defaultModelId}
                  label={modelLabel(settings.defaultModelId)}
                  onChange={(id) => void update({ defaultModelId: id })}
                />

                <div>
                  <div className="font-medium">Title model</div>
                  <div className="text-muted-foreground text-xs">
                    Cheap model used to name chats automatically.
                  </div>
                </div>
                <ModelSelect
                  value={settings.titleModelId}
                  label={modelLabel(settings.titleModelId)}
                  onChange={(id) => void update({ titleModelId: id })}
                />

                <div>
                  <div className="font-medium">Default thinking level</div>
                  <div className="text-muted-foreground text-xs">
                    Used for new chats when the model supports it.
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                    {LEVEL_LABELS[settings.defaultThinking]}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuRadioGroup
                      value={settings.defaultThinking}
                      onValueChange={(v) => void update({ defaultThinking: v as ThinkingLevel })}
                    >
                      {THINKING_LEVELS.map((l) => (
                        <DropdownMenuRadioItem key={l} value={l}>
                          {LEVEL_LABELS[l]}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="font-medium">Auto-title chats</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void update({ autoTitle: !settings.autoTitle })}
                >
                  {settings.autoTitle ? 'On' : 'Off'}
                </Button>

                <div className="font-medium">Send with</div>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                    {settings.sendKey === 'enter' ? 'Enter' : '⌘ Enter'}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuRadioGroup
                      value={settings.sendKey}
                      onValueChange={(v) => void update({ sendKey: v as SendKey })}
                    >
                      <DropdownMenuRadioItem value="enter">Enter</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="mod-enter">⌘ Enter</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="font-medium">Theme</div>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                    {theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System'}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuRadioGroup value={theme ?? 'system'} onValueChange={setTheme}>
                      <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </section>
            </>
          )}
        </div>

        {!required && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ModelSelect({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const models = useModels((s) => s.models);
  return (
    <ModelSelectPopover
      open={open}
      setOpen={setOpen}
      label={label}
      models={models}
      value={value}
      onChange={onChange}
    />
  );
}

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { OpenRouterModel } from '@/lib/openrouter/types';

function ModelSelectPopover({
  open,
  setOpen,
  label,
  models,
  value,
  onChange,
}: {
  open: boolean;
  setOpen: (o: boolean) => void;
  label: string;
  models: OpenRouterModel[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className="max-w-[220px] justify-start" />}
      >
        <span className="truncate">{label}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <Command>
          <CommandInput placeholder="Search models…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No models.</CommandEmpty>
            {models.map((m) => (
              <CommandItem
                key={m.id}
                value={`${m.id} ${m.name}`}
                onSelect={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className={m.id === value ? 'font-medium' : undefined}
              >
                <div className="min-w-0">
                  <div className="truncate">{m.name}</div>
                  <div className="text-muted-foreground truncate font-mono text-[11px]">{m.id}</div>
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
