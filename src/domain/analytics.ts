export type ReportingPeriod = 'week' | 'month' | 'lastMonth' | 'all';
export type TrendPeriod = '7d' | '30d' | '6m' | '12m';
export type DateBounds = { start: number; end: number; label: string };
export type Bucket = { key: string; label: string; incomePaise: number; expensePaise: number };

const dayStart = (value: number) => {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};
const dayOffset = (value: number, days: number) => {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime();
};
const monthStart = (value: number, offset = 0) => {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth() + offset, 1).getTime();
};
const dayKey = (value: number) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const monthKey = (value: number) => dayKey(value).slice(0, 7);

export function reportingBounds(period: ReportingPeriod, now = Date.now(), firstTransactionDate: number | null = null): DateBounds {
  const tomorrow = dayOffset(now, 1);
  if (period === 'week') {
    const date = new Date(now);
    const mondayOffset = (date.getDay() + 6) % 7;
    return { start: dayOffset(now, -mondayOffset), end: tomorrow, label: 'This Week' };
  }
  if (period === 'month') return { start: monthStart(now), end: tomorrow, label: 'This Month' };
  if (period === 'lastMonth') return { start: monthStart(now, -1), end: monthStart(now), label: 'Last Month' };
  return { start: firstTransactionDate === null ? dayStart(now) : dayStart(firstTransactionDate), end: tomorrow, label: 'All Time' };
}

export function trendBounds(period: TrendPeriod, now = Date.now()): DateBounds {
  const end = dayOffset(now, 1);
  if (period === '7d') return { start: dayOffset(now, -6), end, label: 'Last 7 Days' };
  if (period === '30d') return { start: dayOffset(now, -29), end, label: 'Last 30 Days' };
  if (period === '6m') return { start: monthStart(now, -5), end, label: 'Last 6 Months' };
  return { start: monthStart(now, -11), end, label: 'Last 12 Months' };
}

export function calendarDays(bounds: DateBounds): number {
  let days = 0;
  for (let at = bounds.start; at < bounds.end; at = dayOffset(at, 1)) days++;
  return days;
}

export function fillBuckets(
  bounds: DateBounds,
  rows: readonly { key: string; incomePaise: number; expensePaise: number }[],
  unit: 'day' | 'month'
): Bucket[] {
  const values = new Map(rows.map((row) => [row.key, row]));
  const result: Bucket[] = [];
  for (let at = bounds.start; at < bounds.end; at = unit === 'day' ? dayOffset(at, 1) : monthStart(at, 1)) {
    const key = unit === 'day' ? dayKey(at) : monthKey(at);
    const row = values.get(key);
    const date = new Date(at);
    result.push({ key, label: unit === 'day' ? `${date.getDate()}` : `${date.toLocaleString('en-IN', { month: 'short' })} '${String(date.getFullYear()).slice(-2)}`,
      incomePaise: row?.incomePaise ?? 0, expensePaise: row?.expensePaise ?? 0 });
  }
  return result;
}

export function groupDaysForChart(days: readonly Bucket[], period: ReportingPeriod): Bucket[] {
  if (period !== 'month' && period !== 'lastMonth') return [...days];
  const groups: Bucket[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const segment = days.slice(i, i + 7);
    groups.push({ key: segment[0].key, label: `${segment[0].label}–${segment.at(-1)?.label}`,
      incomePaise: segment.reduce((sum, row) => sum + row.incomePaise, 0),
      expensePaise: segment.reduce((sum, row) => sum + row.expensePaise, 0) });
  }
  return groups;
}

export function percentOf(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

export function spendingChange(current: number, previous: number): { percent: number; direction: 'increase' | 'decrease' | 'unchanged' } | null {
  if (previous === 0) return null;
  const change = ((current - previous) / previous) * 100;
  return { percent: Math.abs(change), direction: change > 0 ? 'increase' : change < 0 ? 'decrease' : 'unchanged' };
}

export function averageDailyPaise(expensesPaise: number, bounds: DateBounds): number {
  return Math.round(expensesPaise / Math.max(1, calendarDays(bounds)));
}

export function mostFrequentCategory<T extends { name: string; amountPaise: number; count: number }>(categories: readonly T[]): T | undefined {
  return [...categories].sort((a, b) => b.count - a.count || b.amountPaise - a.amountPaise || a.name.localeCompare(b.name))[0];
}
