import { formatCost, formatTokens } from '@/lib/cost';
import type { TileTotals } from '@/lib/analytics';
import type { SpendTotalsRow } from '@/lib/db';

interface Props {
  totals: SpendTotalsRow | null;
  tiles: TileTotals | undefined;
  loading: boolean;
}

function Tile({
  label,
  spend,
  tokens,
  replies,
  approx,
  sub,
}: {
  label: string;
  spend: number;
  tokens: number;
  replies: number;
  approx: boolean;
  sub?: string;
}) {
  return (
    <div className="bg-card border-border flex flex-col gap-1 rounded-xl border p-4">
      <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </div>
      <div className="text-2xl font-semibold tracking-tight tabular-nums">
        {formatCost({ cost: spend, exact: !approx })}
      </div>
      <div className="text-muted-foreground text-xs tabular-nums">
        {formatTokens(tokens)} tokens · {replies} {replies === 1 ? 'reply' : 'replies'}
        {sub ? <span className="before:mx-1.5 before:content-['·']">{sub}</span> : null}
      </div>
    </div>
  );
}

const fmtSince = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function StatTiles({ totals, tiles, loading }: Props) {
  if (loading || !tiles) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-card border-border h-[104px] animate-pulse rounded-xl border"
          />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        label="All time"
        spend={totals?.cost ?? 0}
        tokens={totals?.total_tokens ?? 0}
        replies={totals?.replies ?? 0}
        approx={(totals?.missing_cost ?? 0) > 0}
        sub={totals?.first_at ? `since ${fmtSince.format(new Date(totals.first_at))}` : undefined}
      />
      <Tile label="Today" {...tiles.today} />
      <Tile label="Last 7 days" {...tiles.last7} />
      <Tile label="Last 30 days" {...tiles.last30} />
    </div>
  );
}
