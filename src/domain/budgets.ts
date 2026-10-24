export type BudgetMonth = { year: number; month: number };
export type BudgetStatus = 'On Track' | 'Near Limit' | 'Limit Reached' | 'Exceeded';

export function monthFor(date: Date): BudgetMonth {
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function shiftMonth(value: BudgetMonth, offset: number): BudgetMonth {
  const date = new Date(value.year, value.month - 1 + offset, 1);
  return monthFor(date);
}

export function monthBounds(value: BudgetMonth): { start: number; end: number } {
  if (!Number.isSafeInteger(value.year) || value.year < 1 || !Number.isInteger(value.month) || value.month < 1 || value.month > 12) {
    throw new Error('Invalid budget month');
  }
  return { start: new Date(value.year, value.month - 1, 1).getTime(), end: new Date(value.year, value.month, 1).getTime() };
}

export function monthLabel(value: BudgetMonth): string {
  return new Date(value.year, value.month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function calculateBudgetUsage(limitPaise: number, spentPaise: number) {
  if (!Number.isSafeInteger(limitPaise) || limitPaise <= 0 || !Number.isSafeInteger(spentPaise) || spentPaise < 0) {
    throw new Error('Invalid budget usage');
  }
  const remainingPaise = limitPaise - spentPaise;
  const usedPercent = (spentPaise / limitPaise) * 100;
  const status: BudgetStatus = spentPaise > limitPaise ? 'Exceeded'
    : spentPaise === limitPaise ? 'Limit Reached'
      : BigInt(spentPaise) * 5n >= BigInt(limitPaise) * 4n ? 'Near Limit' : 'On Track';
  return { remainingPaise, usedPercent, status, progress: Math.min(1, spentPaise / limitPaise) };
}
