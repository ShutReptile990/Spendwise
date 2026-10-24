import type { SQLiteDatabase } from 'expo-sqlite';

import { goalProgress, type EntryType, type GoalStatus } from '../domain/savings-goals.ts';
import { localDateStart } from '../domain/heatmap.ts';

type Query = Pick<SQLiteDatabase, 'getAllAsync' | 'getFirstAsync'>;
type Database = Query & Pick<SQLiteDatabase, 'withExclusiveTransactionAsync'>;
type Writer = Query & Pick<SQLiteDatabase, 'runAsync'>;

export type GoalInput = { name: string; targetPaise: number; targetDate: string | null; description: string | null; icon: string };
export type Goal = GoalInput & { id: string; status: GoalStatus; savedPaise: number; createdAt: number; updatedAt: number };
export type EntryInput = { type: EntryType; amountPaise: number; entryDate: number; notes: string | null };
export type GoalEntry = EntryInput & { id: string; goalId: string; createdAt: number; updatedAt: number };
type GoalRow = { id: string; name: string; target_amount_paise: number; target_date: string | null; description: string | null; icon: string; status: GoalStatus; created_at: number; updated_at: number; saved_paise: number };
type EntryRow = { id: string; goal_id: string; entry_type: EntryType; amount_paise: number; entry_date: number; notes: string | null; created_at: number; updated_at: number };

const goalSelect = `SELECT g.id, g.name, g.target_amount_paise, g.target_date, g.description, g.icon, g.status, g.created_at, g.updated_at,
  COALESCE((SELECT SUM(CASE WHEN e.entry_type = 'contribution' THEN e.amount_paise ELSE -e.amount_paise END) FROM savings_goal_entries e WHERE e.goal_id = g.id), 0) AS saved_paise
  FROM savings_goals g`;

function mapGoal(row: GoalRow): Goal {
  if (!Number.isSafeInteger(row.saved_paise) || row.saved_paise < 0) throw new Error('Savings ledger is invalid');
  return { id: row.id, name: row.name, targetPaise: row.target_amount_paise, targetDate: row.target_date,
    description: row.description, icon: row.icon, status: row.status, savedPaise: row.saved_paise, createdAt: row.created_at, updatedAt: row.updated_at };
}
function mapEntry(row: EntryRow): GoalEntry {
  return { id: row.id, goalId: row.goal_id, type: row.entry_type, amountPaise: row.amount_paise,
    entryDate: row.entry_date, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at };
}
function normalizedGoal(input: GoalInput): GoalInput {
  const name = input.name.trim();
  const description = input.description?.trim() || null;
  if (!name || name.length > 120) throw new Error('Enter a goal name up to 120 characters');
  if (!Number.isSafeInteger(input.targetPaise) || input.targetPaise <= 0) throw new Error('Enter a target greater than zero');
  if (input.targetDate !== null && localDateStart(input.targetDate) === null) throw new Error('Enter a valid target date');
  if (description && description.length > 1000) throw new Error('Description cannot exceed 1,000 characters');
  if (!['target', 'travel', 'emergency', 'gift', 'home'].includes(input.icon)) throw new Error('Choose a goal icon');
  return { ...input, name, description };
}
function normalizedEntry(input: EntryInput): EntryInput {
  const notes = input.notes?.trim() || null;
  if (input.type !== 'contribution' && input.type !== 'withdrawal') throw new Error('Choose a valid entry type');
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0) throw new Error('Enter an amount greater than zero');
  if (!Number.isSafeInteger(input.entryDate) || input.entryDate <= 0 || input.entryDate > Date.now()) throw new Error('Choose a valid entry date');
  if (notes && notes.length > 1000) throw new Error('Note cannot exceed 1,000 characters');
  return { ...input, notes };
}

export async function getGoals(db: Query): Promise<Goal[]> {
  return (await db.getAllAsync<GoalRow>(`${goalSelect} ORDER BY CASE g.status WHEN 'active' THEN 0 WHEN 'completed' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END, g.target_date IS NULL, g.target_date, g.created_at DESC`)).map(mapGoal);
}
export async function getGoal(db: Query, id: string): Promise<Goal | null> {
  const row = await db.getFirstAsync<GoalRow>(`${goalSelect} WHERE g.id = ?`, id);
  return row ? mapGoal(row) : null;
}
export async function getGoalEntries(db: Query, goalId: string): Promise<GoalEntry[]> {
  return (await db.getAllAsync<EntryRow>('SELECT * FROM savings_goal_entries WHERE goal_id = ? ORDER BY entry_date DESC, created_at DESC, id DESC', goalId)).map(mapEntry);
}

export async function createGoal(db: Database, input: GoalInput, id: string, now = Date.now()): Promise<Goal> {
  const value = normalizedGoal(input);
  if (!id || !Number.isSafeInteger(now) || now <= 0) throw new Error('Invalid goal ID or timestamp');
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(`INSERT INTO savings_goals (id, name, target_amount_paise, target_date, description, icon, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`, id, value.name, value.targetPaise, value.targetDate, value.description, value.icon, now, now);
  });
  return (await getGoal(db, id))!;
}

export async function updateGoal(db: Database, id: string, input: GoalInput, now = Date.now()): Promise<Goal> {
  const value = normalizedGoal(input);
  await db.withExclusiveTransactionAsync(async (tx) => {
    const old = await getGoal(tx, id);
    if (!old) throw new Error('Goal not found');
    const status = old.status === 'active' || old.status === 'completed'
      ? old.savedPaise >= value.targetPaise ? 'completed' : 'active' : old.status;
    await tx.runAsync(`UPDATE savings_goals SET name = ?, target_amount_paise = ?, target_date = ?, description = ?, icon = ?, status = ?, updated_at = ? WHERE id = ?`,
      value.name, value.targetPaise, value.targetDate, value.description, value.icon, status, now, id);
  });
  return (await getGoal(db, id))!;
}

export async function setGoalStatus(db: Database, id: string, status: 'active' | 'paused' | 'archived', now = Date.now()) {
  await db.withExclusiveTransactionAsync(async (tx) => {
    const goal = await getGoal(tx, id);
    if (!goal) throw new Error('Goal not found');
    const actual = status === 'active' && goal.savedPaise >= goal.targetPaise ? 'completed' : status;
    await tx.runAsync('UPDATE savings_goals SET status = ?, updated_at = ? WHERE id = ?', actual, now, id);
  });
}

async function updateCompletion(tx: Writer, goalId: string, now: number) {
  const goal = await getGoal(tx, goalId);
  if (!goal) throw new Error('Goal not found');
  if (goal.status === 'active' || goal.status === 'completed') {
    const status = goalProgress(goal.targetPaise, goal.savedPaise).remainingPaise === 0 ? 'completed' : 'active';
    await tx.runAsync('UPDATE savings_goals SET status = ?, updated_at = ? WHERE id = ?', status, now, goalId);
  } else await tx.runAsync('UPDATE savings_goals SET updated_at = ? WHERE id = ?', now, goalId);
}

export async function createGoalEntry(db: Database, goalId: string, input: EntryInput, id: string, now = Date.now()): Promise<GoalEntry> {
  const value = normalizedEntry(input);
  if (!id) throw new Error('Entry ID is required');
  await db.withExclusiveTransactionAsync(async (tx) => {
    const goal = await getGoal(tx, goalId);
    if (!goal) throw new Error('Goal not found');
    if (goal.status === 'archived') throw new Error('Restore the archived goal before changing its ledger');
    if (value.type === 'withdrawal' && value.amountPaise > goal.savedPaise) throw new Error('Withdrawal exceeds the recorded savings');
    await tx.runAsync(`INSERT INTO savings_goal_entries (id, goal_id, entry_type, amount_paise, entry_date, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, goalId, value.type, value.amountPaise, value.entryDate, value.notes, now, now);
    await updateCompletion(tx, goalId, now);
  });
  return (await getGoalEntries(db, goalId)).find((entry) => entry.id === id)!;
}

export async function updateGoalEntry(db: Database, id: string, input: EntryInput, now = Date.now()): Promise<void> {
  const value = normalizedEntry(input);
  await db.withExclusiveTransactionAsync(async (tx) => {
    const old = await tx.getFirstAsync<EntryRow>('SELECT * FROM savings_goal_entries WHERE id = ?', id);
    if (!old) throw new Error('Entry not found');
    const goal = await getGoal(tx, old.goal_id);
    if (!goal || goal.status === 'archived') throw new Error('Goal is unavailable');
    const oldSigned = old.entry_type === 'contribution' ? old.amount_paise : -old.amount_paise;
    const nextSigned = value.type === 'contribution' ? value.amountPaise : -value.amountPaise;
    if (goal.savedPaise - oldSigned + nextSigned < 0) throw new Error('Change would make recorded savings negative');
    await tx.runAsync('UPDATE savings_goal_entries SET entry_type = ?, amount_paise = ?, entry_date = ?, notes = ?, updated_at = ? WHERE id = ?',
      value.type, value.amountPaise, value.entryDate, value.notes, now, id);
    await updateCompletion(tx, old.goal_id, now);
  });
}

export async function deleteGoalEntry(db: Database, id: string, now = Date.now()): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    const old = await tx.getFirstAsync<EntryRow>('SELECT * FROM savings_goal_entries WHERE id = ?', id);
    if (!old) throw new Error('Entry not found');
    const goal = await getGoal(tx, old.goal_id);
    if (!goal || goal.status === 'archived') throw new Error('Goal is unavailable');
    if (old.entry_type === 'contribution' && old.amount_paise > goal.savedPaise) throw new Error('Deleting this contribution would make savings negative');
    await tx.runAsync('DELETE FROM savings_goal_entries WHERE id = ?', id);
    await updateCompletion(tx, old.goal_id, now);
  });
}
