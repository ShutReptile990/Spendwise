import type { DateBounds } from './analytics.ts';

export type HeatmapPeriod = 'current' | 'previous' | '3m' | '6m' | '12m';
export type DailySpending = { date: string; amountPaise: number; count: number };
export type HeatmapDay = DailySpending & { intensity: 0 | 1 | 2 | 3 | 4 | 5 };

export const heatmapPeriods: { value: HeatmapPeriod; label: string }[] = [
  { value: 'current', label: 'This Month' }, { value: 'previous', label: 'Last Month' },
  { value: '3m', label: '3 Months' }, { value: '6m', label: '6 Months' }, { value: '12m', label: '12 Months' },
];

export function localDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function localDateStart(key: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return localDateKey(date.getTime()) === key ? date.getTime() : null;
}

export function heatmapBounds(period: HeatmapPeriod, now = Date.now()): DateBounds {
  const date = new Date(now);
  const month = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
  if (period === 'previous') return { start: new Date(date.getFullYear(), date.getMonth() - 1, 1).getTime(), end: month, label: 'Previous Month' };
  const months = period === '3m' ? 3 : period === '6m' ? 6 : period === '12m' ? 12 : 1;
  return { start: new Date(date.getFullYear(), date.getMonth() - months + 1, 1).getTime(), end: next, label: period === 'current' ? 'Current Month' : `Last ${months} Months` };
}

/** Winsorize at the 90th percentile of nonzero days, then divide into five equal bands.
 * This keeps one unusually large day from flattening all other intensities. */
export function getHeatmapData(bounds: DateBounds, totals: readonly DailySpending[]): HeatmapDay[] {
  const byDate = new Map(totals.map((row) => [row.date, row]));
  const positive = totals.filter((row) => row.amountPaise > 0).map((row) => row.amountPaise).sort((a, b) => a - b);
  const cap = positive.length ? positive[Math.ceil(positive.length * 0.9) - 1] : 0;
  const days: HeatmapDay[] = [];
  for (let at = bounds.start; at < bounds.end;) {
    const date = new Date(at);
    const key = localDateKey(at);
    const row = byDate.get(key);
    const amountPaise = row?.amountPaise ?? 0;
    const intensity = amountPaise === 0 ? 0 : Math.min(5, Math.max(1, Math.ceil(Math.min(amountPaise, cap) * 5 / cap))) as HeatmapDay['intensity'];
    days.push({ date: key, amountPaise, count: row?.count ?? 0, intensity });
    at = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
  }
  return days;
}
