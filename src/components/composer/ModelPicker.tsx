import { useMemo, useState } from 'react';
import { Check, ChevronDown, FileText, Image as ImageIcon, RefreshCw, Star, X } from 'lucide-react';
import { acceptsFiles, acceptsImages } from '@/lib/attachments/support';
import { useAttachmentDraft } from '@/store/attachmentDraftStore';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supportsReasoning } from '@/lib/openrouter/reasoning';
import type { OpenRouterModel } from '@/lib/openrouter/types';
import { cn } from '@/lib/utils';
import { useChat } from '@/store/chatStore';
import { useModels } from '@/store/modelStore';
import { useSettings } from '@/store/settingsStore';
import { ProviderIcon, providerOf } from './ProviderIcon';
import { shortName } from '@/lib/modelName';

export { shortName };

export function formatPrice(perToken?: string): string {
  if (!perToken) return '';
  const n = Number(perToken) * 1_000_000;
  if (!Number.isFinite(n)) return '';
  if (n === 0) return 'free';
  return `$${n < 1 ? n.toFixed(2) : n.toFixed(n < 10 ? 1 : 0)}`;
}

function formatContext(n?: number): string {
  if (!n) return '';
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`;
}

interface ModelPickerProps {
  onOpenSettings: () => void;
  /** Compare mode: bind to this lane instead of the single-model draft. */
  lane?: number;
}

export function ModelPicker({ onOpenSettings, lane }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const models = useModels((s) => s.models);
  const loading = useModels((s) => s.loading);
  const refresh = useModels((s) => s.refresh);
  const selectedId = useChat((s) =>
    lane === undefined ? s.draftModelId : (s.draftLanes[lane]?.modelId ?? s.draftModelId),
  );
  const setDraftModel = useChat((s) => s.setDraftModel);
  const setLane = useChat((s) => s.setLane);
  const setModel = (id: string) =>
    lane === undefined ? setDraftModel(id) : setLane(lane, { modelId: id });
  const favourites = useSettings((s) => s.settings.favouriteModelIds);
  const recents = useSettings((s) => s.settings.recentModelIds);
  const toggleFavourite = useSettings((s) => s.toggleFavourite);

  const selected = useModels((s) => s.byId.get(selectedId));
  const pending = useAttachmentDraft((s) => s.pending);
  const needsImages = pending.some((p) => p.kind === 'image');
  const incompatible = (m: OpenRouterModel) => needsImages && !acceptsImages(m);

  const groups = useMemo(() => {
    const byId = new Map(models.map((m) => [m.id, m]));
    const fav = (favourites.map((id) => byId.get(id)).filter(Boolean) as OpenRouterModel[]).sort(
      (a, b) => Number(b.pricing?.prompt ?? 0) - Number(a.pricing?.prompt ?? 0),
    );
    const rec = recents
      .filter((id) => !favourites.includes(id))
      .map((id) => byId.get(id))
      .filter(Boolean) as OpenRouterModel[];
    const rest = new Map<string, OpenRouterModel[]>();
    for (const m of models) {
      const provider = providerOf(m.id);
      const list = rest.get(provider) ?? [];
      list.push(m);
      rest.set(provider, list);
    }
    const providers = [...rest.entries()].sort(([a], [b]) => a.localeCompare(b));
    return { fav, rec, providers };
  }, [models, favourites, recents]);

  const pick = (id: string) => {
    void setModel(id);
    setOpen(false);
  };

  const row = (m: OpenRouterModel, short = false) => (
    <CommandItem
      key={m.id}
      value={`${m.id} ${m.name}`}
      onSelect={() => pick(m.id)}
      className={cn('group/item flex items-center gap-2', incompatible(m) && 'opacity-40')}
      title={incompatible(m) ? "Can't read the attached images" : undefined}
    >
      <ProviderIcon modelId={m.id} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate">
          <span className="truncate">{short ? shortName(m.name) : m.name}</span>
          {supportsReasoning(m) ? (
            <span className="bg-muted text-muted-foreground rounded px-1 text-[10px] leading-4">
              thinks
            </span>
          ) : null}
          {acceptsImages(m) ? (
            <ImageIcon
              className="text-muted-foreground size-3 shrink-0"
              aria-label="Reads images"
            />
          ) : null}
          {acceptsFiles(m) ? (
            <FileText className="text-muted-foreground size-3 shrink-0" aria-label="Reads PDFs" />
          ) : null}
        </div>
        <div className="text-muted-foreground truncate font-mono text-[11px]">{m.id}</div>
      </div>
      <Check className={cn('size-4 shrink-0', m.id === selectedId ? 'opacity-100' : 'opacity-0')} />
      <div className="text-muted-foreground shrink-0 text-right text-[11px] leading-4">
        <div>{formatContext(m.context_length)}</div>
        <div>
          {formatPrice(m.pricing?.prompt)}
          {m.pricing?.completion ? ` / ${formatPrice(m.pricing.completion)}` : ''}
        </div>
      </div>
      <button
        type="button"
        aria-label={favourites.includes(m.id) ? 'Unpin model' : 'Pin model'}
        onClick={(e) => {
          e.stopPropagation();
          void toggleFavourite(m.id);
          setQuery('');
        }}
        className={cn(
          'text-muted-foreground hover:text-foreground shrink-0 p-0.5',
          favourites.includes(m.id) ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-60',
        )}
      >
        <Star className={cn('size-3.5', favourites.includes(m.id) && 'fill-current')} />
      </button>
    </CommandItem>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery('');
      }}
    >
      <PopoverTrigger
        render={<Button variant="ghost" size="sm" className="max-w-[260px] gap-1.5 font-medium" />}
      >
        {selectedId ? <ProviderIcon modelId={selectedId} /> : null}
        <span className="truncate">
          {selected ? shortName(selected.name) : selectedId || 'Pick a model'}
        </span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[440px] p-0">
        <Command>
          <div className="flex items-center pr-2 [&>[data-slot=command-input-wrapper]]:flex-1">
            <CommandInput placeholder="Search models…" value={query} onValueChange={setQuery} />
            {query ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Clear search"
                onClick={() => setQuery('')}
              >
                <X className="size-3.5" />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Refresh models"
              disabled={loading}
              onClick={() => void refresh()}
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            </Button>
          </div>
          <CommandList className="max-h-[420px]">
            <CommandEmpty>
              {models.length === 0 ? (
                <span>
                  No models loaded.{' '}
                  <button type="button" className="underline" onClick={onOpenSettings}>
                    Check settings
                  </button>
                </span>
              ) : (
                'No models match.'
              )}
            </CommandEmpty>
            {groups.fav.length > 0 && (
              <CommandGroup heading="Favourites">
                {groups.fav.map((m) => row(m, true))}
              </CommandGroup>
            )}
            {groups.rec.length > 0 && (
              <CommandGroup heading="Recent">{groups.rec.map((m) => row(m))}</CommandGroup>
            )}
            {groups.providers.map(([provider, list]) => (
              <CommandGroup key={provider} heading={provider}>
                {list.map((m) => row(m))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
