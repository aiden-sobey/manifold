import { useMemo, useState } from 'react';
import { Check, ChevronDown, ImagePlus, RefreshCw, Star, X } from 'lucide-react';
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
import { formatCost } from '@/lib/cost';
import { estimateImageCost, imageControls } from '@/lib/openrouter/images';
import type { ImageModel } from '@/lib/openrouter/types';
import { cn } from '@/lib/utils';
import { useAttachmentDraft } from '@/store/attachmentDraftStore';
import { useChat } from '@/store/chatStore';
import { useImageModels } from '@/store/imageModelStore';
import { useSettings } from '@/store/settingsStore';
import { ProviderIcon, providerOf } from './ProviderIcon';
import { shortName } from '@/lib/modelName';

/** Model picker for image turns: OpenRouter's image catalog, with a price per image. */
export function ImageModelPicker() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const models = useImageModels((s) => s.models);
  const loading = useImageModels((s) => s.loading);
  const refresh = useImageModels((s) => s.refresh);
  const prices = useImageModels((s) => s.prices);
  const loadPrices = useImageModels((s) => s.loadPrices);
  const selectedId = useChat((s) => s.draftImageModelId);
  const setModel = useChat((s) => s.setDraftImageModel);
  const favourites = useSettings((s) => s.settings.favouriteImageModelIds);
  const recents = useSettings((s) => s.settings.recentImageModelIds);
  const toggleFavourite = useSettings((s) => s.toggleFavouriteImage);

  const selected = useImageModels((s) => s.byId.get(selectedId));
  const references = useAttachmentDraft((s) => s.pending.filter((p) => p.kind === 'image').length);
  const incompatible = (m: ImageModel) =>
    references > 0 && imageControls(m).maxReferences < references;

  const groups = useMemo(() => {
    const byId = new Map(models.map((m) => [m.id, m]));
    const fav = favourites.map((id) => byId.get(id)).filter(Boolean) as ImageModel[];
    const rec = recents
      .filter((id) => !favourites.includes(id))
      .map((id) => byId.get(id))
      .filter(Boolean) as ImageModel[];
    const rest = new Map<string, ImageModel[]>();
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

  const price = (m: ImageModel) => {
    const lines = prices.get(m.id);
    const est = lines ? estimateImageCost(lines, { resolution: null, quality: null }) : null;
    return est ? formatCost(est) : '';
  };

  const row = (m: ImageModel, short = false) => (
    <CommandItem
      key={m.id}
      value={`${m.id} ${m.name}`}
      onSelect={() => pick(m.id)}
      className={cn('group/item flex items-center gap-2', incompatible(m) && 'opacity-40')}
      title={incompatible(m) ? "Can't take this many reference images" : undefined}
    >
      <ProviderIcon modelId={m.id} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate">
          <span className="truncate">{short ? shortName(m.name) : m.name}</span>
          {imageControls(m).maxReferences > 0 ? (
            <ImagePlus
              className="text-muted-foreground size-3 shrink-0"
              aria-label="Edits images"
            />
          ) : null}
        </div>
        <div className="text-muted-foreground truncate font-mono text-[11px]">{m.id}</div>
      </div>
      <Check className={cn('size-4 shrink-0', m.id === selectedId ? 'opacity-100' : 'opacity-0')} />
      <div
        className="text-muted-foreground shrink-0 text-right text-[11px] leading-4"
        title="Price per image (~ means estimated)"
      >
        {price(m)}
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
          favourites.includes(m.id)
            ? 'opacity-100'
            : 'opacity-0 group-hover/item:opacity-60 pointer-coarse:opacity-60',
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
        if (o) void loadPrices(models.map((m) => m.id));
        else setQuery('');
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="max-w-[260px] min-w-0 shrink gap-1.5 font-medium"
          />
        }
      >
        {selectedId ? <ProviderIcon modelId={selectedId} /> : null}
        <span className="truncate">
          {selected ? shortName(selected.name) : selectedId || 'Pick an image model'}
        </span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(440px,calc(100vw-1.5rem))] p-0">
        <Command>
          <div className="flex items-center pr-2 [&>[data-slot=command-input-wrapper]]:flex-1">
            <CommandInput
              placeholder="Search image models…"
              value={query}
              onValueChange={setQuery}
            />
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
              aria-label="Refresh image models"
              disabled={loading}
              onClick={() => void refresh()}
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            </Button>
          </div>
          <CommandList className="max-h-[420px]">
            <CommandEmpty>
              {models.length === 0 ? 'No image models loaded.' : 'No models match.'}
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
