import { OTHER_KEY, SYSTEM_KEY } from '@/lib/analytics';

export const SERIES_COLORS = [
  'var(--viz-1)',
  'var(--viz-2)',
  'var(--viz-3)',
  'var(--viz-4)',
  'var(--viz-5)',
  'var(--viz-6)',
];

/** Fixed slot per model, assigned by rank once. Other is always neutral. */
export function seriesColor(seriesIds: string[], id: string): string {
  if (id === OTHER_KEY) return 'var(--viz-other)';
  if (id === SYSTEM_KEY) return 'var(--viz-system)';
  const i = seriesIds.indexOf(id);
  return SERIES_COLORS[i >= 0 ? i % SERIES_COLORS.length : 0] ?? 'var(--viz-other)';
}
