import { localDateStart } from './heatmap.ts';

export type GoalStatus = 'active' | 'completed' | 'paused' | 'archived';
export type EntryType = 'contribution' | 'withdrawal';

export function goalProgress(targetPaise: number, savedPaise: number) {
  if (!Number.isSafeInteger(targetPaise) || targetPaise <= 0 || !Number.isSafeInteger(savedPaise) || savedPaise < 0) throw new Error('Invalid goal amounts');
  return { remainingPaise: Math.max(0, targetPaise - savedPaise), percent: Math.round(savedPaise / targetPaise * 100), visualPercent: Math.min(100, savedPaise / targetPaise * 100) };
}

export function savingsForecast(targetPaise: number, savedPaise: number, targetDate: string | null, now = Date.now()) {
  if (!targetDate) return null;
  const target = localDateStart(targetDate);
  if (target === null) throw new Error('Invalid target date');
  const remaining = goalProgress(targetPaise, savedPaise).remainingPaise;
  if (remaining === 0) return { kind: 'complete' as const, monthlyPaise: 0, months: 0 };
  const today = new Date(now);
  const deadline = new Date(target);
  const months = (deadline.getFullYear() - today.getFullYear()) * 12 + deadline.getMonth() - today.getMonth() + (deadline.getDate() >= today.getDate() ? 1 : 0);
  if (target < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) return { kind: 'past' as const, monthlyPaise: 0, months: 0 };
  return { kind: 'estimate' as const, monthlyPaise: Math.ceil(remaining / Math.max(1, months)), months: Math.max(1, months) };
}

export function allocationSummary(goals: readonly { status: GoalStatus; savedPaise: number; targetPaise: number; targetDate: string | null }[]) {
  const active = goals.filter((goal) => goal.status === 'active' || goal.status === 'completed');
  const allocatedPaise = active.reduce((sum, goal) => sum + goal.savedPaise, 0);
  const totalAllocatedPaise = goals.reduce((sum, goal) => sum + goal.savedPaise, 0);
  const remainingPaise = active.reduce((sum, goal) => sum + goalProgress(goal.targetPaise, goal.savedPaise).remainingPaise, 0);
  if (![allocatedPaise, totalAllocatedPaise, remainingPaise].every(Number.isSafeInteger)) throw new Error('Savings allocation total is too large');
  const upcoming = active.filter((goal) => goal.targetDate).sort((a, b) => a.targetDate!.localeCompare(b.targetDate!))[0] ?? null;
  return { allocatedPaise, totalAllocatedPaise, remainingPaise, activeCount: active.length, upcoming };
}
