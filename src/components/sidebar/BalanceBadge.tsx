import { RefreshCw, Wallet } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useBalance } from '@/store/balanceStore';
import { cn } from '@/lib/utils';

function money(n: number): string {
  return `$${n.toFixed(n < 10 ? 2 : n < 1000 ? 1 : 0)}`;
}

export function BalanceBadge({ onOpenSettings }: { onOpenSettings: () => void }) {
  const remaining = useBalance((s) => s.remaining);
  const source = useBalance((s) => s.source);
  const keyUsage = useBalance((s) => s.keyUsage);
  const fetchedAt = useBalance((s) => s.fetchedAt);
  const loading = useBalance((s) => s.loading);
  const error = useBalance((s) => s.error);
  const refresh = useBalance((s) => s.refresh);

  const label = remaining === null ? '—' : money(remaining);
  const updatedAt = fetchedAt
    ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(fetchedAt)
    : null;
  const updated = updatedAt ? `Updated at ${updatedAt}. Click to refresh.` : 'Click to refresh.';

  const tip = error
    ? error
    : source === 'account'
      ? updated
      : source === 'key-limit'
        ? `Remaining on this key's spending limit. ${updated} Add a management key in Settings for the account balance.`
        : keyUsage !== null
          ? `Key has used ${money(keyUsage)} all time. Add a management key in Settings to see the balance.`
          : 'Add a management key in Settings to see your OpenRouter balance.';

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={() => (source === 'none' && !error ? onOpenSettings() : void refresh(true))}
            className={cn(
              'text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-md px-2 py-1 text-xs tabular-nums transition-colors',
              error && 'text-destructive',
              remaining !== null && remaining < 1 && 'text-amber-500',
            )}
            aria-label="OpenRouter balance"
          />
        }
      >
        {loading ? (
          <RefreshCw className="size-3.5 animate-spin" />
        ) : (
          <Wallet className="size-3.5" />
        )}
        <span>{label}</span>
      </TooltipTrigger>
      <TooltipContent side="top" align="end">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}
