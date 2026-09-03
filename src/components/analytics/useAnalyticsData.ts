import { useEffect, useMemo, useState } from 'react';
import * as db from '@/lib/db';
import {
  SYSTEM_KEY,
  bucketRows,
  hasSystem,
  parsePeriod,
  modelSummaries,
  rangeStart,
  tileTotals,
  topModels,
  type Granularity,
  type Metric,
  type RangePreset,
} from '@/lib/analytics';
import { useModels } from '@/store/modelStore';

export function useAnalyticsData(granularity: Granularity, range: RangePreset, metric: Metric) {
  const byId = useModels((s) => s.byId);
  const [totals, setTotals] = useState<db.SpendTotalsRow | null>(null);
  const [allRows, setAllRows] = useState<db.DailyModelRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // One fetch of everything; ranges are applied in memory (data volume is small).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [t, rows] = await Promise.all([db.spendTotals(), db.spendByDayAndModel(null)]);
        if (cancelled) return;
        setTotals(t);
        setAllRows(rows);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const now = useMemo(() => new Date(), [allRows]); // eslint-disable-line react-hooks/exhaustive-deps

  const derived = useMemo(() => {
    if (!allRows) return null;
    const start = rangeStart(range, granularity, now, totals?.first_at ?? null);
    const inRange = start ? allRows.filter((r) => parsePeriod(r.period) >= start) : allRows;
    const summaries = modelSummaries(inRange, byId);
    const seriesIds = [
      ...topModels(summaries, metric),
      ...(hasSystem(summaries) ? [SYSTEM_KEY] : []),
    ];
    const buckets = bucketRows(inRange, granularity, metric, start, now, byId, seriesIds);
    const tiles = tileTotals(allRows, now, byId);
    return { start, summaries, seriesIds, buckets, tiles };
  }, [allRows, range, granularity, metric, byId, now, totals?.first_at]);

  return {
    loading: allRows === null && error === null,
    error,
    totals,
    ...derived,
    refresh: () => setRefreshKey((k) => k + 1),
  };
}
