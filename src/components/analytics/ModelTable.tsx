import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, Cog, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProviderIcon } from '@/components/composer/ProviderIcon';
import { SYSTEM_KEY, type ModelSummary } from '@/lib/analytics';
import { formatCost, formatTokens } from '@/lib/cost';
import { cn } from '@/lib/utils';
import { seriesColor } from './chartPalette';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useModels } from '@/store/modelStore';

type SortKey = 'spend' | 'promptTokens' | 'completionTokens' | 'replies' | 'avgPerReply' | 'share';

interface Props {
  summaries: ModelSummary[] | undefined;
  seriesIds: string[] | undefined;
  nameOf: (id: string) => string;
  /** Omitted on mobile, where there is no native save dialog. */
  onExport?: () => void;
  loading: boolean;
}

const COLS: Array<[SortKey, string]> = [
  ['spend', 'Spend'],
  ['promptTokens', 'Input'],
  ['completionTokens', 'Output'],
  ['replies', 'Messages'],
  ['avgPerReply', 'Avg / Message'],
  ['share', 'Share'],
];

export function ModelTable({ summaries, seriesIds, nameOf, onExport, loading }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'spend',
    dir: 'desc',
  });
  const [systemOpen, setSystemOpen] = useState(false);

  const rows = useMemo(() => {
    const list = [...(summaries ?? [])];
    list.sort((a, b) =>
      sort.dir === 'desc' ? b[sort.key] - a[sort.key] : a[sort.key] - b[sort.key],
    );
    return list;
  }, [summaries, sort]);

  const totals = useMemo(() => {
    const t = {
      spend: 0,
      promptTokens: 0,
      completionTokens: 0,
      inputCostEst: 0 as number | null,
      outputCostEst: 0 as number | null,
      replies: 0,
      approx: false,
    };
    for (const r of rows) {
      t.spend += r.spend;
      t.promptTokens += r.promptTokens;
      t.completionTokens += r.completionTokens;
      t.inputCostEst =
        t.inputCostEst === null || r.inputCostEst === null ? null : t.inputCostEst + r.inputCostEst;
      t.outputCostEst =
        t.outputCostEst === null || r.outputCostEst === null
          ? null
          : t.outputCostEst + r.outputCostEst;
      t.replies += r.replies;
      t.approx ||= r.approx;
    }
    return t;
  }, [rows]);

  const clickSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' },
    );

  return (
    <section className="bg-card border-border rounded-xl border">
      <div className="flex items-center gap-2 px-4 py-3">
        <h2 className="text-sm font-semibold">Models</h2>
        <span className="text-muted-foreground text-xs">in selected range</span>
        {onExport ? (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto gap-1.5"
            onClick={onExport}
            disabled={loading || rows.length === 0}
          >
            <Download className="size-3.5" /> Export CSV
          </Button>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground border-border border-y text-xs">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Model</th>
              {COLS.map(([key, label]) => (
                <th key={key} className="px-3 py-2 text-right font-medium">
                  <button
                    type="button"
                    onClick={() => clickSort(key)}
                    className={cn(
                      'hover:text-foreground inline-flex items-center gap-1',
                      sort.key === key && 'text-foreground',
                    )}
                  >
                    {label}
                    {sort.key === key ? (
                      sort.dir === 'desc' ? (
                        <ArrowDown className="size-3" />
                      ) : (
                        <ArrowUp className="size-3" />
                      )
                    ) : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-muted-foreground px-4 py-6 text-center text-xs">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-muted-foreground px-4 py-6 text-center text-xs">
                  No messages in this range.
                </td>
              </tr>
            ) : (
              rows.flatMap((r) => {
                const isSystem = r.modelId === SYSTEM_KEY;
                const main = (
                  <Row
                    key={r.modelId}
                    r={r}
                    color={seriesColor(seriesIds ?? [], r.modelId)}
                    name={nameOf(r.modelId)}
                    icon={
                      isSystem ? (
                        <Cog className="text-muted-foreground size-4 shrink-0" />
                      ) : (
                        <ProviderIcon modelId={r.modelId} />
                      )
                    }
                    expandable={isSystem && Boolean(r.children?.length)}
                    open={systemOpen}
                    onToggle={() => setSystemOpen((o) => !o)}
                  />
                );
                if (!isSystem || !systemOpen || !r.children) return [main];
                return [
                  main,
                  ...r.children.map((c) => (
                    <Row
                      key={`sys-${c.modelId}`}
                      r={c}
                      color={null}
                      name={nameOf(c.modelId)}
                      icon={<ProviderIcon modelId={c.modelId} />}
                      child
                    />
                  )),
                ];
              })
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-border border-t text-xs font-medium">
              <tr>
                <td className="px-4 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatCost({ cost: totals.spend, exact: !totals.approx })}
                </td>
                <TokenCell tokens={totals.promptTokens} cost={totals.inputCostEst} />
                <TokenCell tokens={totals.completionTokens} cost={totals.outputCostEst} />
                <td className="px-3 py-2 text-right tabular-nums">{totals.replies}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatCost({
                    cost: totals.replies ? totals.spend / totals.replies : 0,
                    exact: !totals.approx,
                  })}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">100%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

/** "$3.00 / 1M input tokens" from OpenRouter's per-token price string. */
function rateLabel(rate: string | undefined, kind: 'input' | 'output'): string | null {
  const perToken = Number(rate);
  if (!rate || !Number.isFinite(perToken)) return null;
  const perM = perToken * 1_000_000;
  if (perM === 0) return `Free ${kind} tokens`;
  const digits = perM < 0.1 ? 3 : perM < 10 ? 2 : perM < 100 ? 1 : 0;
  return `$${perM.toFixed(digits)} / 1M ${kind} tokens`;
}

/** Token count with the list-price cost of those tokens beneath it; hover for the model's rate. */
function TokenCell({
  tokens,
  cost,
  rate,
  kind,
}: {
  tokens: number;
  cost: number | null;
  rate?: string;
  kind?: 'input' | 'output';
}) {
  const label = kind ? rateLabel(rate, kind) : null;
  const body = (
    <div className="inline-block text-right">
      <div>{formatTokens(tokens)}</div>
      {cost !== null ? (
        <div className="text-muted-foreground text-[11px]">
          {formatCost({ cost, exact: false })}
        </div>
      ) : null}
    </div>
  );
  return (
    <td className="px-3 py-2 text-right tabular-nums">
      {label ? (
        <Tooltip>
          <TooltipTrigger render={<span className="cursor-default" />}>{body}</TooltipTrigger>
          <TooltipContent side="top">
            {label}
            {cost !== null ? (
              <span className="opacity-70"> · cost estimated from list price</span>
            ) : null}
          </TooltipContent>
        </Tooltip>
      ) : (
        body
      )}
    </td>
  );
}

function Row({
  r,
  color,
  name,
  icon,
  expandable = false,
  open = false,
  onToggle,
  child = false,
}: {
  r: ModelSummary;
  color: string | null;
  name: string;
  icon: React.ReactNode;
  expandable?: boolean;
  open?: boolean;
  onToggle?: () => void;
  child?: boolean;
}) {
  const pricing = useModels((s) => s.byId.get(r.modelId)?.pricing);
  const nameCell = (
    <div className={cn('flex items-center gap-2', child && 'pl-7')}>
      {color ? (
        <span className="size-2 shrink-0 rounded-sm" style={{ background: color }} aria-hidden />
      ) : null}
      {icon}
      <span className="truncate">{name}</span>
      {expandable ? (
        <ChevronRight
          className={cn(
            'text-muted-foreground size-3.5 shrink-0 transition-transform',
            open && 'rotate-90',
          )}
        />
      ) : null}
    </div>
  );
  return (
    <tr
      className={cn(
        'border-border border-b last:border-b-0',
        child ? 'bg-muted/20 text-muted-foreground' : 'hover:bg-muted/40',
      )}
    >
      <td className="px-4 py-2">
        {expandable ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="hover:bg-muted/60 -mx-1 flex items-center rounded px-1 text-left"
          >
            {nameCell}
          </button>
        ) : (
          nameCell
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {formatCost({ cost: r.spend, exact: !r.approx })}
      </td>
      <TokenCell
        tokens={r.promptTokens}
        cost={r.inputCostEst}
        rate={pricing?.prompt}
        kind="input"
      />
      <TokenCell
        tokens={r.completionTokens}
        cost={r.outputCostEst}
        rate={pricing?.completion}
        kind="output"
      />
      <td className="px-3 py-2 text-right tabular-nums">{r.replies}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        {formatCost({ cost: r.avgPerReply, exact: !r.approx })}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{Math.round(r.share * 100)}%</td>
    </tr>
  );
}
