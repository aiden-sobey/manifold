import { useEffect } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatCost } from '@/lib/cost';
import { effectiveImageOptions, estimateImageCost, imageControls } from '@/lib/openrouter/images';
import { cn } from '@/lib/utils';
import { useChat } from '@/store/chatStore';
import { useImageModels } from '@/store/imageModelStore';
import { useSettings } from '@/store/settingsStore';
import type { ImageOptions as Options } from '@/types/domain';

interface ChoiceProps {
  label: string;
  value: string | null;
  values: Array<string | null>;
  onChange: (v: string | null) => void;
}

function Choice({ label, value, values, onChange }: ChoiceProps) {
  return (
    <div role="group" aria-label={label}>
      <div className="text-muted-foreground mb-1.5 text-xs">{label}</div>
      <div className="flex flex-wrap gap-1">
        {values.map((v) => (
          <button
            key={v ?? 'default'}
            type="button"
            aria-pressed={v === value}
            onClick={() => onChange(v)}
            className={cn(
              'rounded-md border px-2 py-0.5 text-xs capitalize transition-colors',
              v === value
                ? 'border-foreground/30 bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            {v ?? 'Default'}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Aspect ratio, resolution, quality and count for the selected image model, with its price. */
export function ImageOptions() {
  const modelId = useChat((s) => s.draftImageModelId);
  const model = useImageModels((s) => s.byId.get(modelId));
  const lines = useImageModels((s) => s.prices.get(modelId));
  const loadPrices = useImageModels((s) => s.loadPrices);
  const saved = useSettings((s) => s.settings.imageOptions);
  const update = useSettings((s) => s.update);

  useEffect(() => {
    if (modelId) void loadPrices([modelId]);
  }, [modelId, loadPrices]);

  const controls = imageControls(model);
  const options = effectiveImageOptions(model, saved);
  const each = lines ? estimateImageCost(lines, options) : null;
  const total = each ? { ...each, cost: each.cost * options.count } : null;
  // Saved choices persist across models; a model that lacks one just uses its default.
  const set = (patch: Partial<Options>) => void update({ imageOptions: { ...saved, ...patch } });

  const summary = [
    options.aspectRatio,
    options.resolution,
    options.quality,
    options.count > 1 ? `×${options.count}` : null,
    total ? formatCost(total) : null,
  ].filter(Boolean);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground min-w-0 gap-1.5"
            aria-label="Image options"
            title="Image options"
          />
        }
      >
        <SlidersHorizontal className="size-4" />
        {summary.length ? (
          <span className="hidden truncate sm:inline">{summary.join(' · ')}</span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex w-[min(340px,calc(100vw-1.5rem))] flex-col gap-3"
      >
        {controls.aspectRatios.length ? (
          <Choice
            label="Aspect ratio"
            value={options.aspectRatio}
            values={[null, ...controls.aspectRatios]}
            onChange={(aspectRatio) => set({ aspectRatio })}
          />
        ) : null}
        {controls.resolutions.length ? (
          <Choice
            label="Resolution"
            value={options.resolution}
            values={[null, ...controls.resolutions]}
            onChange={(resolution) => set({ resolution })}
          />
        ) : null}
        {controls.qualities.length ? (
          <Choice
            label="Quality"
            value={options.quality}
            values={[null, ...controls.qualities]}
            onChange={(quality) => set({ quality })}
          />
        ) : null}
        {controls.maxCount > 1 ? (
          <Choice
            label="Images"
            value={String(options.count)}
            values={Array.from({ length: controls.maxCount }, (_, i) => String(i + 1))}
            onChange={(v) => set({ count: Number(v) })}
          />
        ) : null}
        <p className="text-muted-foreground border-t pt-2 text-xs">
          {each
            ? `${formatCost(each)} per image${each.exact ? '' : ' (estimate)'}. The reply shows the actual cost.`
            : lines
              ? 'This model has no published price. The reply shows the actual cost.'
              : 'Loading price…'}
        </p>
      </PopoverContent>
    </Popover>
  );
}
