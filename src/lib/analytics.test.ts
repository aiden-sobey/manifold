vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: vi.fn() } }));
import {
  OTHER_KEY,
  SYSTEM_KEY,
  hasSystem,
  bucketRows,
  bucketsCsv,
  modelSummaries,
  rangeStart,
  startOfWeek,
  summariesCsv,
  tileTotals,
  toCsv,
  topModels,
} from './analytics';
import type { DailyModelRow } from './db';
import type { OpenRouterModel } from './openrouter/types';

const row = (day: string, model: string, cost: number | null, tokens: number, extra = {}) =>
  ({
    period: day.includes('T') ? day : `${day}T00`,
    source: 'chat',
    model_id: model,
    replies: 1,
    cost,
    prompt_tokens: tokens / 2,
    completion_tokens: tokens / 2,
    total_tokens: tokens,
    missing_cost: cost === null ? 1 : 0,
    missing_prompt_tokens: cost === null ? tokens / 2 : null,
    missing_completion_tokens: cost === null ? tokens / 2 : null,
    ...extra,
  }) as DailyModelRow;

const priced: OpenRouterModel = {
  id: 'x/priced',
  name: 'Priced',
  pricing: { prompt: '0.000001', completion: '0.000001' },
};
const byId = new Map([[priced.id, priced]]);
const now = new Date(2026, 8, 3, 15); // 3 Sep 2026, a Thursday

describe('dates', () => {
  it('weeks start on Monday', () => {
    expect(startOfWeek(now).getDate()).toBe(31); // Mon 31 Aug
    expect(startOfWeek(new Date(2026, 7, 31)).getDate()).toBe(31);
    expect(startOfWeek(new Date(2026, 8, 6)).getDate()).toBe(31); // Sunday still same week
  });
  it('rangeStart clamps to the earliest message', () => {
    const earliest = new Date(2026, 8, 1).getTime();
    expect(rangeStart('12m', 'month', now, earliest)).toEqual(new Date(2026, 8, 1));
    expect(rangeStart('7d', 'day', now, null)).toEqual(new Date(2026, 7, 28));
    expect(rangeStart('all', 'day', now, null)).toBeNull();
    expect(rangeStart('all', 'week', now, earliest)).toEqual(new Date(2026, 7, 31));
  });
});

describe('modelSummaries', () => {
  it('sums, estimates missing cost, and ranks by spend', () => {
    const s = modelSummaries(
      [
        row('2026-09-01', 'a/x', 0.5, 100),
        row('2026-09-02', 'a/x', 0.25, 100),
        row('2026-09-02', 'x/priced', null, 1000),
      ],
      byId,
    );
    expect(s.map((m) => m.modelId)).toEqual(['a/x', 'x/priced']);
    expect(s[0]?.spend).toBeCloseTo(0.75);
    expect(s[0]?.replies).toBe(2);
    expect(s[0]?.avgPerReply).toBeCloseTo(0.375);
    expect(s[1]?.spend).toBeCloseTo(0.001);
    expect(s[1]?.approx).toBe(true);
    expect((s[0]?.share ?? 0) + (s[1]?.share ?? 0)).toBeCloseTo(1);
  });
});

describe('topModels + bucketRows', () => {
  const rows = [
    row('2026-08-30', 'a/1', 0.5, 10),
    row('2026-09-01', 'a/2', 2, 20),
    row('2026-09-01', 'a/3', 3, 30),
    row('2026-09-03', 'a/1', 0.5, 10),
  ];
  it('folds beyond the top N into Other', () => {
    const s = modelSummaries(rows, byId);
    const top = topModels(s, 'spend', 2);
    expect(top).toEqual(['a/3', 'a/2']);
    const b = bucketRows(rows, 'day', 'spend', new Date(2026, 7, 30), now, byId, top);
    expect(b.map((x) => x.key)).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ]);
    expect(b[0]?.series[OTHER_KEY]).toBe(0.5);
    expect(b[2]?.series['a/3']).toBe(3);
    expect(b[2]?.total).toBe(5);
    expect(b[1]?.total).toBe(0);
  });
  it('rolls up into weeks and months', () => {
    const w = bucketRows(rows, 'week', 'tokens', new Date(2026, 7, 24), now, byId, ['a/1']);
    expect(w.map((x) => x.key)).toEqual(['2026-08-24', '2026-08-31']);
    expect(w[0]?.total).toBe(10);
    expect(w[1]?.total).toBe(60);
    const m = bucketRows(rows, 'month', 'spend', null, now, byId, ['a/1']);
    expect(m.map((x) => x.key)).toEqual(['2026-08', '2026-09']);
    expect(m[1]?.series['a/1']).toBe(0.5);
    expect(m[1]?.series[OTHER_KEY]).toBe(5);
  });
  it('ranks by tokens when the metric is tokens', () => {
    const s = modelSummaries(
      [row('2026-09-01', 'cheap', 0.01, 5000), row('2026-09-01', 'dear', 1, 10)],
      byId,
    );
    expect(topModels(s, 'tokens', 1)).toEqual(['cheap']);
    expect(topModels(s, 'spend', 1)).toEqual(['dear']);
  });
});

describe('hour granularity', () => {
  it('buckets by hour and labels with the day', () => {
    const rows = [row('2026-09-03T09', 'a', 1, 10), row('2026-09-03T11', 'a', 2, 20)];
    const b = bucketRows(
      rows,
      'hour',
      'spend',
      new Date(2026, 8, 3, 9),
      new Date(2026, 8, 3, 11, 30),
      byId,
      ['a'],
    );
    expect(b.map((x) => x.key)).toEqual(['2026-09-03T09', '2026-09-03T10', '2026-09-03T11']);
    expect(b[0]?.label).toMatch(/09:00$/);
    expect(b[2]?.total).toBe(2);
  });
  it('24h range starts 23 hours ago on the hour', () => {
    expect(rangeStart('24h', 'hour', new Date(2026, 8, 3, 15, 40), null)).toEqual(
      new Date(2026, 8, 2, 16),
    );
  });
  it('splits input and output tokens with list-price estimates', () => {
    const s = modelSummaries([row('2026-09-01', 'x/priced', 0.5, 1000)], byId);
    expect(s[0]?.promptTokens).toBe(500);
    expect(s[0]?.completionTokens).toBe(500);
    expect(s[0]?.inputCostEst).toBeCloseTo(0.0005);
    expect(s[0]?.outputCostEst).toBeCloseTo(0.0005);
    expect(
      modelSummaries([row('2026-09-01', 'unpriced', 0.5, 10)], byId)[0]?.inputCostEst,
    ).toBeNull();
  });
});

describe('system usage', () => {
  const rows = [
    row('2026-09-01', 'a/1', 1, 10),
    row('2026-09-01', 'openai/gpt-oss-120b', 0.01, 100, { source: 'system' }),
    row('2026-09-02', 'google/flash', 0.02, 200, { source: 'system' }),
  ];
  it('consolidates system calls into one row with children', () => {
    const s = modelSummaries(rows, byId);
    expect(s.map((m) => m.modelId)).toEqual(['a/1', SYSTEM_KEY]);
    const sys = s[1]!;
    expect(sys.spend).toBeCloseTo(0.03);
    expect(sys.replies).toBe(2);
    expect(sys.children?.map((c) => c.modelId)).toEqual(['google/flash', 'openai/gpt-oss-120b']);
    expect(sys.children?.[0]?.share).toBeCloseTo(0.02 / 1.03);
    expect(hasSystem(s)).toBe(true);
    expect(topModels(s, 'spend')).toEqual(['a/1']);
  });
  it('charts system as its own series', () => {
    const b = bucketRows(rows, 'day', 'spend', null, new Date(2026, 8, 2), byId, [
      'a/1',
      SYSTEM_KEY,
    ]);
    expect(b[0]?.series[SYSTEM_KEY]).toBeCloseTo(0.01);
    expect(b[1]?.series[SYSTEM_KEY]).toBeCloseTo(0.02);
    expect(b[0]?.series['a/1']).toBe(1);
  });
  it('flattens system children in csv', () => {
    const lines = summariesCsv(modelSummaries(rows, byId), (id) => id)
      .trim()
      .split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[2]?.startsWith('system,google/flash')).toBe(true);
  });
});

describe('tileTotals', () => {
  it('buckets into today / 7 / 30 days', () => {
    const t = tileTotals(
      [
        row('2026-09-03', 'a', 1, 1),
        row('2026-09-01', 'a', 2, 2),
        row('2026-08-10', 'a', 4, 4),
        row('2026-07-01', 'a', 8, 8),
      ],
      now,
      byId,
    );
    expect(t.today.spend).toBe(1);
    expect(t.last7.spend).toBe(3);
    expect(t.last30.spend).toBe(7);
  });
});

describe('csv', () => {
  it('escapes commas and quotes', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'he said "hi"']])).toBe('a,b\n"x,y","he said ""hi"""\n');
  });
  it('produces summary and bucket csv', () => {
    const s = modelSummaries([row('2026-09-01', 'a/1', 1, 10)], byId);
    expect(summariesCsv(s, () => 'One').split('\n')[1]).toBe(
      'chat,a/1,One,1.000000,5,5,,,1,1.000000,1.0000,no',
    );
    const b = bucketRows(
      [row('2026-09-01', 'a/1', 1, 10)],
      'day',
      'spend',
      null,
      new Date(2026, 8, 1),
      byId,
      ['a/1'],
    );
    expect(bucketsCsv(b, ['a/1'], () => 'One', 'spend')).toBe(
      'period,One,Other,total_spend\n2026-09-01,1.000000,0.000000,1.000000\n',
    );
  });
});
