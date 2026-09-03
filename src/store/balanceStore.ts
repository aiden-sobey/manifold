import { create } from 'zustand';
import { getApiKey, getManagementKey } from '@/lib/keychain';
import { checkApiKey, getCredits } from '@/lib/openrouter/client';

/** Minimum gap between network refreshes, regardless of how often refresh() is called. */
export const BALANCE_COOLDOWN_MS = 3 * 60 * 1000;
/** Background poll interval. */
export const BALANCE_POLL_MS = 5 * 60 * 1000;

export type BalanceSource = 'account' | 'key-limit' | 'none';

interface BalanceState {
  /** USD remaining, or null when unknown. */
  remaining: number | null;
  source: BalanceSource;
  /** All-time usage reported by the key, for the tooltip. */
  keyUsage: number | null;
  fetchedAt: number | null;
  loading: boolean;
  error: string | null;
  /** Refreshes unless fetched within the cooldown. `force` ignores the cooldown (manual click). */
  refresh: (force?: boolean) => Promise<void>;
}

let inflight: Promise<void> | null = null;

export const useBalance = create<BalanceState>((set, get) => ({
  remaining: null,
  source: 'none',
  keyUsage: null,
  fetchedAt: null,
  loading: false,
  error: null,

  refresh: async (force = false) => {
    const { fetchedAt } = get();
    if (!force && fetchedAt && Date.now() - fetchedAt < BALANCE_COOLDOWN_MS) return;
    if (inflight) return inflight;
    inflight = (async () => {
      set({ loading: true });
      try {
        const [apiKey, mgmt] = await Promise.all([getApiKey(), getManagementKey()]);
        if (!apiKey && !mgmt) {
          set({ remaining: null, source: 'none', loading: false, fetchedAt: Date.now() });
          return;
        }
        let remaining: number | null = null;
        let source: BalanceSource = 'none';
        let keyUsage: number | null = null;
        if (mgmt) {
          const c = await getCredits(mgmt);
          remaining = c.total_credits - c.total_usage;
          source = 'account';
        }
        if (apiKey) {
          const info = await checkApiKey(apiKey).catch(() => null);
          keyUsage = info?.usage ?? null;
          if (source === 'none' && typeof info?.limit_remaining === 'number') {
            remaining = info.limit_remaining;
            source = 'key-limit';
          }
        }
        set({ remaining, source, keyUsage, fetchedAt: Date.now(), loading: false, error: null });
      } catch (e) {
        set({
          loading: false,
          fetchedAt: Date.now(),
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  },
}));
