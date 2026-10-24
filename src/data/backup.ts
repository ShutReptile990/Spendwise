import type { SQLiteDatabase } from 'expo-sqlite';

import { DATABASE_VERSION } from './migrations.ts';
import { paymentMethods } from './types.ts';
import { localDateStart } from '../domain/heatmap.ts';

export const BACKUP_VERSION = 2;
export const MAX_BACKUP_BYTES = 12 * 1024 * 1024;
const MAX_ROWS = 50_000;

export type BackupCategory = { id: string; type: 'income' | 'expense'; name: string; icon: string };
export type BackupTransaction = { id: string; type: 'income' | 'expense'; amount_paise: number; title: string; category_id: string; payment_method: string; notes: string | null; transaction_date: number; created_at: number; updated_at: number };
export type BackupBudget = { id: string; year: number; month: number; category_id: string | null; amount_paise: number; created_at: number; updated_at: number };
export type BackupAlert = { budget_id: string; threshold: 80 | 100; triggered_at: number };
export type BackupGoal = { id: string; name: string; target_amount_paise: number; target_date: string | null; description: string | null; icon: string; status: 'active' | 'completed' | 'paused' | 'archived'; created_at: number; updated_at: number };
export type BackupGoalEntry = { id: string; goal_id: string; entry_type: 'contribution' | 'withdrawal'; amount_paise: number; entry_date: number; notes: string | null; created_at: number; updated_at: number };
export type SpendWiseBackup = {
  applicationName: 'SpendWise'; backupVersion: 1 | 2; createdAt: string; databaseSchemaVersion: number;
  data: { categories: BackupCategory[]; transactions: BackupTransaction[]; budgets: BackupBudget[]; budgetAlertHistory: BackupAlert[];
    savingsGoals: BackupGoal[]; savingsGoalEntries: BackupGoalEntry[]; preferences: Record<string, never> };
};

type Database = Pick<SQLiteDatabase, 'withExclusiveTransactionAsync'>;
type Queryable = Pick<SQLiteDatabase, 'getAllAsync' | 'getFirstAsync'>;
type Writable = Pick<SQLiteDatabase, 'runAsync'>;

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function text(value: unknown, max = 120): value is string { return typeof value === 'string' && value.length > 0 && value.length <= max && value.trim().length > 0; }
function positive(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) > 0; }
function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value) || value.length > MAX_ROWS) throw new Error(`Invalid ${name} list in backup`);
  return value;
}

export function validateBackup(value: unknown): SpendWiseBackup {
  if (!record(value) || value.applicationName !== 'SpendWise') throw new Error('This is not a SpendWise backup');
  if (value.backupVersion !== 1 && value.backupVersion !== BACKUP_VERSION) throw new Error('Unsupported backup format version');
  if (value.databaseSchemaVersion !== (value.backupVersion === 1 ? 2 : DATABASE_VERSION)) throw new Error('Unsupported database schema version');
  if (typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) throw new Error('Invalid backup creation date');
  if (!record(value.data)) throw new Error('Backup data is missing');
  const data = value.data;
  const categories = array(data.categories, 'categories');
  const transactions = array(data.transactions, 'transactions');
  const budgets = array(data.budgets, 'budgets');
  const budgetAlertHistory = array(data.budgetAlertHistory, 'budget alerts');
  const savingsGoals = value.backupVersion === 1 ? [] : array(data.savingsGoals, 'savings goals');
  const savingsGoalEntries = value.backupVersion === 1 ? [] : array(data.savingsGoalEntries, 'savings goal entries');
  if (!record(data.preferences) || Object.keys(data.preferences).length > 0) throw new Error('Unsupported backup preferences');

  const categoryIds = new Set<string>();
  const categoryTypes = new Map<string, string>();
  const categoryNames = new Set<string>();
  for (const item of categories) {
    if (!record(item) || !text(item.id) || !['income', 'expense'].includes(item.type as string) || !text(item.name) || !text(item.icon, 80)) throw new Error('Invalid backup category');
    const nameKey = `${item.type}\0${item.name}`;
    if (categoryIds.has(item.id) || categoryNames.has(nameKey)) throw new Error('Duplicate backup category');
    categoryIds.add(item.id); categoryTypes.set(item.id, item.type as string); categoryNames.add(nameKey);
  }
  const transactionIds = new Set<string>();
  for (const item of transactions) {
    if (!record(item) || !text(item.id) || !['income', 'expense'].includes(item.type as string) || !positive(item.amount_paise) || !text(item.title) ||
      !text(item.category_id) || !paymentMethods.includes(item.payment_method as (typeof paymentMethods)[number]) ||
      !(item.notes === null || (typeof item.notes === 'string' && item.notes.length <= 1000)) ||
      !positive(item.transaction_date) || !positive(item.created_at) || !positive(item.updated_at)) throw new Error('Invalid backup transaction');
    if (transactionIds.has(item.id)) throw new Error('Duplicate transaction ID');
    if (categoryTypes.get(item.category_id) !== item.type) throw new Error('Broken transaction category reference');
    transactionIds.add(item.id);
  }
  const budgetIds = new Set<string>();
  const budgetSlots = new Set<string>();
  for (const item of budgets) {
    if (!record(item) || !text(item.id) || !Number.isInteger(item.year) || (item.year as number) < 1 || (item.year as number) > 9999 ||
      !Number.isInteger(item.month) || (item.month as number) < 1 || (item.month as number) > 12 ||
      !(item.category_id === null || text(item.category_id)) || !positive(item.amount_paise) || !positive(item.created_at) || !positive(item.updated_at)) throw new Error('Invalid backup budget');
    if (item.category_id !== null && categoryTypes.get(item.category_id) !== 'expense') throw new Error('Broken budget category reference');
    const slot = JSON.stringify([item.year, item.month, item.category_id]);
    if (budgetIds.has(item.id) || budgetSlots.has(slot)) throw new Error('Duplicate backup budget');
    budgetIds.add(item.id); budgetSlots.add(slot);
  }
  const alertKeys = new Set<string>();
  for (const item of budgetAlertHistory) {
    if (!record(item) || !text(item.budget_id) || ![80, 100].includes(item.threshold as number) || !positive(item.triggered_at)) throw new Error('Invalid budget alert history');
    const key = `${item.budget_id}:${item.threshold}`;
    if (!budgetIds.has(item.budget_id) || alertKeys.has(key)) throw new Error('Broken or duplicate budget alert');
    alertKeys.add(key);
  }
  const goalIds = new Set<string>();
  for (const item of savingsGoals) {
    if (!record(item) || !text(item.id) || !text(item.name) || !positive(item.target_amount_paise) ||
      !(item.target_date === null || (typeof item.target_date === 'string' && localDateStart(item.target_date) !== null)) ||
      !(item.description === null || (typeof item.description === 'string' && item.description.length <= 1000)) ||
      !['target', 'travel', 'emergency', 'gift', 'home'].includes(item.icon as string) ||
      !['active', 'completed', 'paused', 'archived'].includes(item.status as string) || !positive(item.created_at) || !positive(item.updated_at)) throw new Error('Invalid backup savings goal');
    if (goalIds.has(item.id)) throw new Error('Duplicate savings goal ID');
    goalIds.add(item.id);
  }
  const entryIds = new Set<string>();
  const balances = new Map<string, number>();
  for (const item of savingsGoalEntries) {
    if (!record(item) || !text(item.id) || !text(item.goal_id) || !['contribution', 'withdrawal'].includes(item.entry_type as string) ||
      !positive(item.amount_paise) || !positive(item.entry_date) ||
      !(item.notes === null || (typeof item.notes === 'string' && item.notes.length <= 1000)) ||
      !positive(item.created_at) || !positive(item.updated_at)) throw new Error('Invalid backup savings entry');
    if (entryIds.has(item.id) || !goalIds.has(item.goal_id)) throw new Error('Duplicate or broken savings entry');
    entryIds.add(item.id);
    balances.set(item.goal_id, (balances.get(item.goal_id) ?? 0) + (item.entry_type === 'contribution' ? item.amount_paise as number : -(item.amount_paise as number)));
  }
  for (const balance of balances.values()) if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('Invalid savings goal balance');
  return { ...(value as SpendWiseBackup), data: { ...(data as SpendWiseBackup['data']), savingsGoals: savingsGoals as BackupGoal[], savingsGoalEntries: savingsGoalEntries as BackupGoalEntry[] } };
}

export function parseBackup(raw: string): SpendWiseBackup {
  if (raw.length > MAX_BACKUP_BYTES) throw new Error('Backup file is too large');
  try { return validateBackup(JSON.parse(raw)); }
  catch (error) { if (error instanceof SyntaxError) throw new Error('Invalid JSON backup file'); throw error; }
}

async function readSnapshot(db: Queryable, createdAt: string): Promise<SpendWiseBackup> {
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if (version?.user_version !== DATABASE_VERSION) throw new Error('Database schema is not ready for backup');
  const categories = await db.getAllAsync<BackupCategory>('SELECT id, type, name, icon FROM categories ORDER BY id');
  const transactions = await db.getAllAsync<BackupTransaction>('SELECT id, type, amount_paise, title, category_id, payment_method, notes, transaction_date, created_at, updated_at FROM transactions ORDER BY id');
  const budgets = await db.getAllAsync<BackupBudget>('SELECT id, year, month, category_id, amount_paise, created_at, updated_at FROM budgets ORDER BY id');
  const budgetAlertHistory = await db.getAllAsync<BackupAlert>('SELECT budget_id, threshold, triggered_at FROM budget_alert_history ORDER BY budget_id, threshold');
  const savingsGoals = await db.getAllAsync<BackupGoal>('SELECT id, name, target_amount_paise, target_date, description, icon, status, created_at, updated_at FROM savings_goals ORDER BY id');
  const savingsGoalEntries = await db.getAllAsync<BackupGoalEntry>('SELECT id, goal_id, entry_type, amount_paise, entry_date, notes, created_at, updated_at FROM savings_goal_entries ORDER BY id');
  return validateBackup({ applicationName: 'SpendWise', backupVersion: BACKUP_VERSION, createdAt, databaseSchemaVersion: DATABASE_VERSION,
    data: { categories, transactions, budgets, budgetAlertHistory, savingsGoals, savingsGoalEntries, preferences: {} } });
}

export async function createBackup(db: Database, now = new Date()): Promise<SpendWiseBackup> {
  let snapshot: SpendWiseBackup | null = null;
  await db.withExclusiveTransactionAsync(async (transaction) => { snapshot = await readSnapshot(transaction, now.toISOString()); });
  if (!snapshot) throw new Error('Could not create a consistent backup');
  return snapshot;
}

async function insertBackup(db: Writable, backup: SpendWiseBackup): Promise<void> {
  for (const item of backup.data.categories) await db.runAsync('INSERT INTO categories (id, type, name, icon) VALUES (?, ?, ?, ?)', item.id, item.type, item.name, item.icon);
  for (const item of backup.data.transactions) await db.runAsync(`INSERT INTO transactions
    (id, type, amount_paise, title, category_id, payment_method, notes, transaction_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, item.id, item.type, item.amount_paise, item.title, item.category_id, item.payment_method, item.notes, item.transaction_date, item.created_at, item.updated_at);
  for (const item of backup.data.budgets) await db.runAsync(`INSERT INTO budgets
    (id, year, month, category_id, amount_paise, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    item.id, item.year, item.month, item.category_id, item.amount_paise, item.created_at, item.updated_at);
  for (const item of backup.data.budgetAlertHistory) await db.runAsync('INSERT INTO budget_alert_history (budget_id, threshold, triggered_at) VALUES (?, ?, ?)', item.budget_id, item.threshold, item.triggered_at);
  for (const item of backup.data.savingsGoals) await db.runAsync(`INSERT INTO savings_goals
    (id, name, target_amount_paise, target_date, description, icon, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    item.id, item.name, item.target_amount_paise, item.target_date, item.description, item.icon, item.status, item.created_at, item.updated_at);
  for (const item of backup.data.savingsGoalEntries) await db.runAsync(`INSERT INTO savings_goal_entries
    (id, goal_id, entry_type, amount_paise, entry_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    item.id, item.goal_id, item.entry_type, item.amount_paise, item.entry_date, item.notes, item.created_at, item.updated_at);
}

export async function replaceFromBackup(db: Database, value: unknown): Promise<void> {
  const backup = validateBackup(value);
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync('DELETE FROM savings_goal_entries');
    await transaction.runAsync('DELETE FROM savings_goals');
    await transaction.runAsync('DELETE FROM budget_alert_history');
    await transaction.runAsync('DELETE FROM transactions');
    await transaction.runAsync('DELETE FROM budgets');
    await transaction.runAsync('DELETE FROM categories');
    await insertBackup(transaction, backup);
    const check = await transaction.getFirstAsync<{ result: string }>('PRAGMA foreign_key_check');
    if (check) throw new Error('Restored data failed database integrity checks');
  });
}

export async function deleteAllFinancialData(db: Database): Promise<void> {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync('DELETE FROM savings_goal_entries');
    await transaction.runAsync('DELETE FROM savings_goals');
    await transaction.runAsync('DELETE FROM budget_alert_history');
    await transaction.runAsync('DELETE FROM transactions');
    await transaction.runAsync('DELETE FROM budgets');
  });
}
