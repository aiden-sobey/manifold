import type { DailyModelRow } from './db';
import type { OpenRouterModel } from './openrouter/types';

export type Granularity = 'hour' | 'day' | 'week' | 'month';
export type Metric = 'spend' | 'tokens';
export type RangePreset = '24h' | '7d' | '30d' | '90d' | '12m' | 'all';

export const RANGE_LABELS: Record<RangePreset, string> = {
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '12m': 'Last 12 months',
  all: 'All time',
};

export const DEFAULT_RANGE: Record<Granularity, RangePreset> = {
  hour: '24h',
  day: '30d',
  week: '90d',
  month: '12m',
};

export const OTHER_KEY = '__other__';
/** All background (title-generation) calls, regardless of model. */
export const SYSTEM_KEY = '__system__';
export const MAX_SERIES = 6;

export interface ModelSummary {
  modelId: string;
  spend: number;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  /** List-price estimates of the input/output split. Spend is the charged total. */
  inputCostEst: number | null;
  outputCostEst: number | null;
  /** For the consolidated System row: the per-model breakdown. */
  children?: ModelSummary[];
  replies: number;
  avgPerReply: number;
  share: number; // 0..1 of spend
  approx: boolean;
}

export interface Bucket {
  key: string;
  label: string;
  start: Date;
  /** modelId (or OTHER_KEY) -> value in the chosen metric */
  series: Record<string, number>;
  total: number;
  approx: boolean;
}

// ---- dates (all local time) ----

const pad = (n: number) => String(n).padStart(2, '0');

export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses 'YYYY-MM-DD' or 'YYYY-MM-DDTHH' as local time. */
export function parsePeriod(key: string): Date {
  const [datePart, hourPart] = key.split('T');
  const [y, m, d] = (datePart ?? '').split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, hourPart ? Number(hourPart) : 0);
}

export function startOfHour(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours());
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Monday-based week start. */
export function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  const dow = (s.getDay() + 6) % 7; // Mon=0 .. Sun=6
  s.setDate(s.getDate() - dow);
  return s;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function bucketStart(d: Date, g: Granularity): Date {
  if (g === 'hour') return startOfHour(d);
  if (g === 'day') return startOfDay(d);
  if (g === 'week') return startOfWeek(d);
  return startOfMonth(d);
}

export function nextBucket(start: Date, g: Granularity): Date {
  const n = new Date(start);
  if (g === 'hour') n.setHours(n.getHours() + 1);
  else if (g === 'day') n.setDate(n.getDate() + 1);
  else if (g === 'week') n.setDate(n.getDate() + 7);
  else n.setMonth(n.getMonth() + 1);
  return n;
}

export function bucketKey(start: Date, g: Granularity): string {
  if (g === 'month') return `${start.getFullYear()}-${pad(start.getMonth() + 1)}`;
  if (g === 'hour') return `${localDayKey(start)}T${pad(start.getHours())}`;
  return localDayKey(start);
}

const fmtDay = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const fmtMonth = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' });

export function bucketLabel(start: Date, g: Granularity): string {
  if (g === 'hour') return `${fmtDay.format(start)} ${pad(start.getHours())}:00`;
  if (g === 'day') return fmtDay.format(start);
  if (g === 'week') return `w/c ${fmtDay.format(start)}`;
  return fmtMonth.format(start);
}

/** Start of the range, or null for all time. Clamped to the first message so new installs don't show empty months. */
export function rangeStart(
  preset: RangePreset,
  g: Granularity,
  now: Date,
  earliestMs: number | null,
): Date | null {
  let start: Date | null = null;
  const today = startOfDay(now);
  if (preset === '24h') {
    start = startOfHour(now);
    start.setHours(start.getHours() - 23);
  } else if (preset === '7d')
    start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
  else if (preset === '30d')
    start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
  else if (preset === '90d')
    start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 89);
  else if (preset === '12m') start = new Date(today.getFullYear(), today.getMonth() - 11, 1);

  if (earliestMs !== null) {
    const earliest = bucketStart(new Date(earliestMs), g);
    if (start === null || earliest > start) start = earliest;
  }
  return start === null ? null : bucketStart(start, g);
}

// ---- cost ----

function estimateMissing(row: DailyModelRow, model: OpenRouterModel | undefined): number | null {
  if (!row.missing_cost) return 0;
  const p = Number(model?.pricing?.prompt ?? NaN);
  const c = Number(model?.pricing?.completion ?? NaN);
  if (!Number.isFinite(p) || !Number.isFinite(c)) return null;
  return (row.missing_prompt_tokens ?? 0) * p + (row.missing_completion_tokens ?? 0) * c;
}

/** Charged cost plus list-price estimate for rows without a charged cost. */
export function rowSpend(
  row: DailyModelRow,
  byId: Map<string, OpenRouterModel>,
): { spend: number; approx: boolean } {
  const charged = row.cost ?? 0;
  const est = estimateMissing(row, row.model_id ? byId.get(row.model_id) : undefined);
  return { spend: charged + (est ?? 0), approx: row.missing_cost > 0 };
}

// ---- aggregation ----

function emptySummary(id: string, pPrice: number, cPrice: number): ModelSummary {
  return {
    modelId: id,
    spend: 0,
    tokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    inputCostEst: Number.isFinite(pPrice) ? 0 : null,
    outputCostEst: Number.isFinite(cPrice) ? 0 : null,
    replies: 0,
    avgPerReply: 0,
    share: 0,
    approx: false,
  };
}

function addRow(
  cur: ModelSummary,
  r: DailyModelRow,
  spend: number,
  approx: boolean,
  pPrice: number,
  cPrice: number,
) {
  cur.spend += spend;
  cur.tokens += r.total_tokens ?? 0;
  cur.promptTokens += r.prompt_tokens ?? 0;
  cur.completionTokens += r.completion_tokens ?? 0;
  if (cur.inputCostEst !== null) {
    cur.inputCostEst = Number.isFinite(pPrice)
      ? cur.inputCostEst + (r.prompt_tokens ?? 0) * pPrice
      : null;
  }
  if (cur.outputCostEst !== null) {
    cur.outputCostEst = Number.isFinite(cPrice)
      ? cur.outputCostEst + (r.completion_tokens ?? 0) * cPrice
      : null;
  }
  cur.replies += r.replies;
  cur.approx ||= approx;
}

function finalise(list: ModelSummary[], total: number): ModelSummary[] {
  return list
    .map((m) => ({
      ...m,
      avgPerReply: m.replies ? m.spend / m.replies : 0,
      share: total ? m.spend / total : 0,
      children: m.children ? finalise(m.children, total) : undefined,
    }))
    .sort((a, b) => b.spend - a.spend);
}

/**
 * One row per chat model, plus a single consolidated SYSTEM_KEY row (with per-model children)
 * for background calls such as title generation.
 */
export function modelSummaries(
  rows: DailyModelRow[],
  byId: Map<string, OpenRouterModel>,
): ModelSummary[] {
  const chat = new Map<string, ModelSummary>();
  const system = new Map<string, ModelSummary>();
  const systemTotal = emptySummary(SYSTEM_KEY, NaN, NaN);
  systemTotal.inputCostEst = 0;
  systemTotal.outputCostEst = 0;

  for (const r of rows) {
    const id = r.model_id ?? 'unknown';
    const model = r.model_id ? byId.get(r.model_id) : undefined;
    const pPrice = Number(model?.pricing?.prompt ?? NaN);
    const cPrice = Number(model?.pricing?.completion ?? NaN);
    const { spend, approx } = rowSpend(r, byId);
    const bucket = r.source === 'system' ? system : chat;
    const cur = bucket.get(id) ?? emptySummary(id, pPrice, cPrice);
    addRow(cur, r, spend, approx, pPrice, cPrice);
    bucket.set(id, cur);
    if (r.source === 'system') addRow(systemTotal, r, spend, approx, pPrice, cPrice);
  }

  const list = [...chat.values()];
  if (system.size > 0) {
    systemTotal.children = [...system.values()];
    list.push(systemTotal);
  }
  const total = list.reduce((s, m) => s + m.spend, 0);
  return finalise(list, total);
}

/** The model ids that get their own series, ranked by the chosen metric. */
export function topModels(summaries: ModelSummary[], metric: Metric, max = MAX_SERIES): string[] {
  return summaries
    .filter((m) => m.modelId !== SYSTEM_KEY)
    .sort((a, b) => (metric === 'spend' ? b.spend - a.spend : b.tokens - a.tokens))
    .slice(0, max)
    .map((m) => m.modelId);
}

export function hasSystem(summaries: ModelSummary[]): boolean {
  return summaries.some((m) => m.modelId === SYSTEM_KEY);
}

export function bucketRows(
  rows: DailyModelRow[],
  g: Granularity,
  metric: Metric,
  start: Date | null,
  now: Date,
  byId: Map<string, OpenRouterModel>,
  seriesIds: string[],
): Bucket[] {
  const keep = new Set(seriesIds);
  const map = new Map<string, Bucket>();

  const ensure = (bStart: Date): Bucket => {
    const key = bucketKey(bStart, g);
    let b = map.get(key);
    if (!b) {
      b = {
        key,
        label: bucketLabel(bStart, g),
        start: bStart,
        series: {},
        total: 0,
        approx: false,
      };
      for (const id of seriesIds) b.series[id] = 0;
      b.series[OTHER_KEY] = 0;
      b.series[SYSTEM_KEY] = 0;
      map.set(key, b);
    }
    return b;
  };

  // Dense buckets from start (or first row) to now.
  const firstRowDay = rows[0] ? parsePeriod(rows[0].period) : null;
  const from = start ?? (firstRowDay ? bucketStart(firstRowDay, g) : null);
  if (from) {
    const end = bucketStart(now, g);
    for (let d = from; d <= end; d = nextBucket(d, g)) ensure(d);
  }

  for (const r of rows) {
    const b = ensure(bucketStart(parsePeriod(r.period), g));
    const id = r.source === 'system' ? SYSTEM_KEY : (r.model_id ?? 'unknown');
    const { spend, approx } = rowSpend(r, byId);
    const v = metric === 'spend' ? spend : (r.total_tokens ?? 0);
    const key = keep.has(id) ? id : OTHER_KEY;
    b.series[key] = (b.series[key] ?? 0) + v;
    b.total += v;
    b.approx ||= approx;
  }

  return [...map.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

export interface TileTotals {
  today: { spend: number; tokens: number; replies: number; approx: boolean };
  last7: { spend: number; tokens: number; replies: number; approx: boolean };
  last30: { spend: number; tokens: number; replies: number; approx: boolean };
}

export function tileTotals(
  rows: DailyModelRow[],
  now: Date,
  byId: Map<string, OpenRouterModel>,
): TileTotals {
  const today = startOfDay(now);
  const d7 = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
  const d30 = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
  const mk = () => ({ spend: 0, tokens: 0, replies: 0, approx: false });
  const out: TileTotals = { today: mk(), last7: mk(), last30: mk() };
  const add = (t: TileTotals['today'], r: DailyModelRow) => {
    const { spend, approx } = rowSpend(r, byId);
    t.spend += spend;
    t.tokens += r.total_tokens ?? 0;
    t.replies += r.replies;
    t.approx ||= approx;
  };
  for (const r of rows) {
    const day = parsePeriod(r.period);
    if (day >= d30) add(out.last30, r);
    if (day >= d7) add(out.last7, r);
    if (day >= today) add(out.today, r);
  }
  return out;
}

// ---- csv ----

function csvCell(v: unknown): string {
  let s: string;
  if (v === null || v === undefined) s = '';
  else if (typeof v === 'string') s = v;
  else if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') s = String(v);
  else s = JSON.stringify(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

export function summariesCsv(summaries: ModelSummary[], nameOf: (id: string) => string): string {
  type Flat = ModelSummary & { source: 'chat' | 'system' };
  const flat: Flat[] = summaries.flatMap((m): Flat[] =>
    m.children ? m.children.map((c) => ({ ...c, source: 'system' })) : [{ ...m, source: 'chat' }],
  );
  return toCsv(
    [
      'source',
      'model_id',
      'model',
      'spend_usd',
      'input_tokens',
      'output_tokens',
      'input_cost_est_usd',
      'output_cost_est_usd',
      'messages',
      'avg_per_message_usd',
      'share',
      'estimated',
    ],
    flat.map((m) => [
      m.source,
      m.modelId,
      nameOf(m.modelId),
      m.spend.toFixed(6),
      m.promptTokens,
      m.completionTokens,
      m.inputCostEst === null ? '' : m.inputCostEst.toFixed(6),
      m.outputCostEst === null ? '' : m.outputCostEst.toFixed(6),
      m.replies,
      m.avgPerReply.toFixed(6),
      m.share.toFixed(4),
      m.approx ? 'yes' : 'no',
    ]),
  );
}

export function bucketsCsv(
  buckets: Bucket[],
  seriesIds: string[],
  nameOf: (id: string) => string,
  metric: Metric,
): string {
  const cols = [...seriesIds, OTHER_KEY];
  return toCsv(
    [
      'period',
      ...cols.map((c) => (c === OTHER_KEY ? 'Other' : c === SYSTEM_KEY ? 'System' : nameOf(c))),
      `total_${metric}`,
    ],
    buckets.map((b) => [
      b.key,
      ...cols.map((c) => (metric === 'spend' ? (b.series[c] ?? 0).toFixed(6) : (b.series[c] ?? 0))),
      metric === 'spend' ? b.total.toFixed(6) : b.total,
    ]),
  );
}
