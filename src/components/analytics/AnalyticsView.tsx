import { useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { Button } from '@/components/ui/button';
import { shortName } from '@/lib/modelName';
import {
  DEFAULT_RANGE,
  SYSTEM_KEY,
  summariesCsv,
  type Granularity,
  type Metric,
  type RangePreset,
} from '@/lib/analytics';
import { useWindowDrag } from '@/lib/useWindowDrag';
import { useModels } from '@/store/modelStore';
import { useUi } from '@/store/uiStore';
import { ModelTable } from './ModelTable';
import { SpendChart } from './SpendChart';
import { StatTiles } from './StatTiles';
import { useAnalyticsData } from './useAnalyticsData';

export function AnalyticsView() {
  const showChat = useUi((s) => s.showChat);
  const byId = useModels((s) => s.byId);
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [range, setRange] = useState<RangePreset>(DEFAULT_RANGE.day);
  const [metric, setMetric] = useState<Metric>('spend');
  const data = useAnalyticsData(granularity, range, metric);
  const onDrag = useWindowDrag();

  useEffect(() => {
    if (data.error) toast.error(data.error);
  }, [data.error]);

  const nameOf = (id: string) => {
    if (id === SYSTEM_KEY) return 'System';
    const m = byId.get(id);
    return m ? shortName(m.name) : id;
  };

  const changeGranularity = (g: Granularity) => {
    setGranularity(g);
    setRange(DEFAULT_RANGE[g]);
  };

  const exportCsv = async () => {
    if (!data.summaries) return;
    try {
      const path = await save({
        defaultPath: `manifold-spend-${range}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (!path) return;
      await writeTextFile(path, summariesCsv(data.summaries, nameOf));
      toast.success('Exported CSV');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <header
        data-tauri-drag-region
        onMouseDown={onDrag}
        className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-3"
      >
        <div className="flex">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={showChat}>
            <ArrowLeft className="size-4" /> Back
          </Button>
        </div>
        <span className="pointer-events-none text-sm font-medium select-none">Analytics</span>
        <div className="flex justify-end">
          <Button variant="ghost" size="icon-sm" aria-label="Refresh" onClick={data.refresh}>
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-6 pb-8">
          <StatTiles totals={data.totals} tiles={data.tiles} loading={data.loading} />
          <SpendChart
            buckets={data.buckets}
            seriesIds={data.seriesIds}
            nameOf={nameOf}
            granularity={granularity}
            onGranularity={changeGranularity}
            range={range}
            onRange={setRange}
            metric={metric}
            onMetric={setMetric}
            loading={data.loading}
          />
          <ModelTable
            summaries={data.summaries}
            seriesIds={data.seriesIds}
            nameOf={nameOf}
            onExport={() => void exportCsv()}
            loading={data.loading}
          />
          {data.totals && data.totals.replies === 0 && !data.loading ? (
            <p className="text-muted-foreground text-center text-sm">
              No spend yet. Send a message and come back.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
