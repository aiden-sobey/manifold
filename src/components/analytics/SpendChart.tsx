import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  OTHER_KEY,
  RANGE_LABELS,
  SYSTEM_KEY,
  type Bucket,
  type Granularity,
  type Metric,
  type RangePreset,
} from '@/lib/analytics';
import { formatCost, formatTokens } from '@/lib/cost';
import { cn } from '@/lib/utils';
import { seriesColor } from './chartPalette';

interface Props {
  buckets: Bucket[] | undefined;
  seriesIds: string[] | undefined;
  nameOf: (id: string) => string;
  granularity: Granularity;
  onGranularity: (g: Granularity) => void;
  range: RangePreset;
  onRange: (r: RangePreset) => void;
  metric: Metric;
  onMetric: (m: Metric) => void;
  loading: boolean;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<[T, string]>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="bg-muted inline-flex rounded-lg p-0.5" role="tablist">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={v === value}
          onClick={() => onChange(v)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            v === value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function SpendChart({
  buckets,
  seriesIds,
  nameOf,
  granularity,
  onGranularity,
  range,
  onRange,
  metric,
  onMetric,
  loading,
}: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const fmt = (v: number) =>
    metric === 'spend' ? formatCost({ cost: v, exact: true }) : formatTokens(v);
  const series = [...(seriesIds ?? []), OTHER_KEY];
  const label = (id: string) =>
    id === OTHER_KEY ? 'Other' : id === SYSTEM_KEY ? 'System' : nameOf(id);
  const hasOther = buckets?.some((b) => (b.series[OTHER_KEY] ?? 0) > 0) ?? false;
  const visibleSeries = series.filter((id) => id !== OTHER_KEY || hasOther);
  const empty = !loading && (!buckets || buckets.every((b) => b.total === 0));

  const data = (buckets ?? []).map((b) => ({
    ...b.series,
    label: b.label,
    key: b.key,
    total: b.total,
  }));

  const toggle = (id: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <section className="bg-card border-border rounded-xl border p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">
          {metric === 'spend' ? 'Spend' : 'Tokens'} by model
        </h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Segmented
            value={metric}
            options={[
              ['spend', 'Spend'],
              ['tokens', 'Tokens'],
            ]}
            onChange={onMetric}
          />
          <Segmented
            value={granularity}
            options={[
              ['hour', 'Hour'],
              ['day', 'Day'],
              ['week', 'Week'],
              ['month', 'Month'],
            ]}
            onChange={onGranularity}
          />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-1" />}>
              {RANGE_LABELS[range]}
              <ChevronDown className="size-3.5 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={range}
                onValueChange={(v) => onRange(v as RangePreset)}
              >
                {(Object.keys(RANGE_LABELS) as RangePreset[]).map((r) => (
                  <DropdownMenuRadioItem key={r} value={r}>
                    {RANGE_LABELS[r]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="h-[320px]">
        {loading ? (
          <div className="bg-muted/40 h-full animate-pulse rounded-lg" />
        ) : empty ? (
          <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
            No {metric === 'spend' ? 'spend' : 'usage'} in this range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              barCategoryGap="20%"
            >
              <CartesianGrid vertical={false} stroke="var(--viz-grid)" strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={56}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickFormatter={(v: number) => fmt(v)}
              />
              <Tooltip
                cursor={{ fill: 'var(--foreground)', fillOpacity: 0.05 }}
                content={(p) => (
                  <ChartTooltip
                    active={Boolean(p.active)}
                    row={(p.payload?.[0]?.payload ?? null) as Record<string, unknown> | null}
                    series={visibleSeries}
                    hidden={hidden}
                    nameOf={label}
                    fmt={fmt}
                  />
                )}
              />
              {visibleSeries.map((id) => (
                <Bar
                  key={id}
                  dataKey={id}
                  name={label(id)}
                  stackId="a"
                  fill={seriesColor(seriesIds ?? [], id)}
                  hide={hidden.has(id)}
                  stroke="var(--card)"
                  strokeWidth={1}
                  maxBarSize={48}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {!loading && !empty && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {visibleSeries.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              className={cn(
                'flex items-center gap-1.5 transition-opacity',
                hidden.has(id) ? 'opacity-40' : 'hover:opacity-80',
              )}
              aria-pressed={!hidden.has(id)}
            >
              <span
                className="size-2.5 rounded-sm"
                style={{ background: seriesColor(seriesIds ?? [], id) }}
              />
              <span className="text-foreground">{label(id)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ChartTooltip({
  active,
  row,
  series,
  hidden,
  nameOf,
  fmt,
}: {
  active: boolean;
  row: Record<string, unknown> | null;
  series: string[];
  hidden: Set<string>;
  nameOf: (id: string) => string;
  fmt: (v: number) => string;
}) {
  if (!active || !row) return null;
  const title = typeof row.label === 'string' ? row.label : '';
  const items = series
    .filter((id) => !hidden.has(id))
    .map((id) => ({ id, v: Number(row[id] ?? 0) }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v);
  const total = items.reduce((s, x) => s + x.v, 0);
  return (
    <div className="bg-popover text-popover-foreground border-border min-w-[200px] rounded-lg border p-2.5 text-xs shadow-md">
      <div className="mb-1.5 font-medium">{title}</div>
      <div className="flex flex-col gap-1">
        {items.map((x) => (
          <div key={x.id} className="flex items-center gap-2">
            <span className="size-2 rounded-sm" style={{ background: seriesColor(series, x.id) }} />
            <span className="truncate">{nameOf(x.id)}</span>
            <span className="ml-auto tabular-nums">{fmt(x.v)}</span>
          </div>
        ))}
      </div>
      <div className="border-border mt-1.5 flex justify-between border-t pt-1.5 font-medium">
        <span>Total</span>
        <span className="tabular-nums">{fmt(total)}</span>
      </div>
    </div>
  );
}
