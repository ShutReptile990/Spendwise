import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import test from 'node:test';

import { createBackup, deleteAllFinancialData, replaceFromBackup, validateBackup } from '../src/data/backup.ts';
import { getDailySpendingTotals, getSpendingForDate, getSpendingHeatmap } from '../src/data/heatmap.ts';
import { DATABASE_VERSION, migrateDatabase } from '../src/data/migrations.ts';
import { createGoal, createGoalEntry, deleteGoalEntry, getGoal, getGoalEntries, getGoals, setGoalStatus, updateGoal, updateGoalEntry } from '../src/data/savings-goals.ts';
import { createTransaction, getAllTransactions, getTotals } from '../src/data/transactions.ts';
import { applyTransactionFilters, defaultTransactionFilters } from '../src/domain/transaction-filters.ts';
import { getHeatmapData, heatmapBounds, localDateKey, localDateStart } from '../src/domain/heatmap.ts';
import { allocationSummary, goalProgress, savingsForecast } from '../src/domain/savings-goals.ts';
import { heatmapColors } from '../src/theme/palette.ts';

class Database {
  constructor(path = ':memory:') { this.connection = new DatabaseSync(path); }
  async execAsync(sql) { this.connection.exec(sql); }
  async runAsync(sql, ...params) { const result = this.connection.prepare(sql).run(...params); return { changes: Number(result.changes) }; }
  async getFirstAsync(sql, ...params) { return this.connection.prepare(sql).get(...params) ?? null; }
  async getAllAsync(sql, ...params) { return this.connection.prepare(sql).all(...params); }
  async withTransactionAsync(task) { return this.withExclusiveTransactionAsync(task); }
  async withExclusiveTransactionAsync(task) {
    this.connection.exec('BEGIN IMMEDIATE');
    try { const result = await task(this); this.connection.exec('COMMIT'); return result; }
    catch (error) { this.connection.exec('ROLLBACK'); throw error; }
  }
  close() { this.connection.close(); }
}
const setup = async () => { const db = new Database(); await migrateDatabase(db); return db; };
const at = (year, month, day, hour = 12, minute = 0) => new Date(year, month - 1, day, hour, minute).getTime();
const goalInput = (changes = {}) => ({ name: 'Laptop', targetPaise: 6000000, targetDate: '2027-05-01', description: null, icon: 'target', ...changes });
const entryInput = (type, amountPaise, changes = {}) => ({ type, amountPaise, entryDate: Date.now() - 1000, notes: null, ...changes });
const transactionInput = (type, amountPaise, transactionDate) => ({ type, amountPaise, transactionDate, title: 'Recorded item', categoryId: type === 'expense' ? 'expense-food' : 'income-salary', paymentMethod: 'Cash', notes: null });

test('heatmap aggregates only expenses by local transaction date and includes empty days', async () => {
  const db = await setup();
  try {
    const now = at(2026, 10, 22);
    await createTransaction(db, transactionInput('expense', 25000, at(2026, 10, 22, 0, 1)), 'ex1');
    await createTransaction(db, transactionInput('expense', 15000, at(2026, 10, 22, 23, 59)), 'ex2');
    await createTransaction(db, transactionInput('income', 900000, at(2026, 10, 22)), 'in1');
    await createTransaction(db, transactionInput('expense', 10000, at(2026, 10, 21, 23, 59)), 'ex3');
    const bounds = heatmapBounds('current', now);
    const rows = await getDailySpendingTotals(db, bounds.start, bounds.end);
    assert.deepEqual(rows.find((row) => row.date === '2026-10-22'), { date: '2026-10-22', amountPaise: 40000, count: 2 });
    const days = await getSpendingHeatmap(db, 'current', now);
    assert.equal(days.length, 22);
    assert.equal(days.find((day) => day.date === '2026-10-20').intensity, 0);
    const detail = await getSpendingForDate(db, '2026-10-22');
    assert.equal(detail.count, 2);
    assert.equal(detail.amountPaise, 40000);
    assert.deepEqual(detail.highest, { category: 'Food & Drinks', amountPaise: 25000 });
    assert.equal(detail.categories[0].amountPaise, 40000);
  } finally { db.close(); }
});

test('heatmap periods include leap day and correct month boundaries; selection filter is exact', async () => {
  const now = at(2024, 3, 5);
  assert.equal(getHeatmapData(heatmapBounds('previous', now), []).length, 29);
  assert.equal(getHeatmapData(heatmapBounds('current', now), []).length, 5);
  assert.equal(getHeatmapData(heatmapBounds('3m', now), []).length, 31 + 29 + 5);
  assert.equal(getHeatmapData(heatmapBounds('6m', now), [])[0].date, '2023-10-01');
  assert.equal(getHeatmapData(heatmapBounds('12m', now), [])[0].date, '2023-04-01');
  assert.equal(localDateStart('2024-02-30'), null);
  assert.equal(localDateKey(at(2024, 2, 29, 23, 59)), '2024-02-29');
  const db = await setup();
  try {
    await createTransaction(db, transactionInput('expense', 700, at(2024, 2, 29)), 'leap');
    await createTransaction(db, transactionInput('expense', 800, at(2024, 3, 1)), 'march');
    const filters = { ...defaultTransactionFilters(), type: 'expense', datePreset: 'custom', customStartDate: localDateStart('2024-02-29'), customEndDate: localDateStart('2024-02-29') };
    assert.deepEqual(applyTransactionFilters(await getAllTransactions(db), filters).map((row) => row.id), ['leap']);
  } finally { db.close(); }
});

test('90th percentile heatmap scaling keeps ordinary spending visible beside an outlier', () => {
  const bounds = { start: at(2026, 1, 1), end: at(2026, 1, 12), label: 'Test' };
  const amounts = [100, 200, 300, 400, 500, 600, 700, 800, 900, 100000];
  const totals = amounts.map((amountPaise, index) => ({ date: localDateKey(at(2026, 1, index + 1)), amountPaise, count: 1 }));
  const days = getHeatmapData(bounds, totals);
  assert.ok(days.find((day) => day.date === '2026-01-09').intensity >= 3);
  assert.equal(days.find((day) => day.date === '2026-01-11').intensity, 0);
});

test('heatmap display bands run from light low spending to dark high spending', () => {
  const bounds = { start: at(2026, 1, 1, 0), end: at(2026, 1, 7, 0), label: 'Test' };
  const totals = [10, 20, 30, 40, 50].map((amountPaise, index) => ({ date: localDateKey(at(2026, 1, index + 1)), amountPaise, count: 1 }));
  const days = getHeatmapData(bounds, totals);
  assert.deepEqual(days.map((day) => day.intensity), [1, 2, 3, 4, 5, 0]);
  assert.deepEqual(days.map((day) => heatmapColors[day.intensity]), ['#BFDBFE', '#93C5FD', '#60A5FA', '#3B82F6', '#1D4ED8', '#1B2A41']);
  assert.deepEqual(days.map((day) => day.amountPaise), [10, 20, 30, 40, 50, 0]);
});

test('version 3 migration preserves existing financial data and adds constrained savings tables', async () => {
  const db = await setup();
  try {
    await createTransaction(db, transactionInput('expense', 500, Date.now() - 2000), 'existing');
    await db.execAsync('DROP TABLE savings_goal_entries; DROP TABLE savings_goals; PRAGMA user_version = 2;');
    await migrateDatabase(db);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, DATABASE_VERSION);
    assert.equal((await getTotals(db)).expensePaise, 500);
    await assert.rejects(db.runAsync(`INSERT INTO savings_goal_entries (id, goal_id, entry_type, amount_paise, entry_date, created_at, updated_at) VALUES ('bad', 'none', 'contribution', -1, 1, 1, 1)`));
  } finally { db.close(); }
});

test('goal CRUD, contribution ledger, edits, withdrawals and completion preserve cash-flow totals', async () => {
  const db = await setup();
  try {
    await createTransaction(db, transactionInput('income', 9000000, Date.now() - 2000), 'salary');
    const before = await getTotals(db);
    await assert.rejects(createGoal(db, goalInput({ name: ' ', targetPaise: -1 }), 'invalid'), /name/);
    await createGoal(db, goalInput(), 'goal1');
    await assert.rejects(createGoal(db, goalInput(), 'goal1'));
    await createGoalEntry(db, 'goal1', entryInput('contribution', 2000000), 'entry1');
    await createGoalEntry(db, 'goal1', entryInput('contribution', 4500000), 'entry2');
    assert.equal((await getGoal(db, 'goal1')).status, 'completed');
    assert.equal((await getGoal(db, 'goal1')).savedPaise, 6500000);
    await assert.rejects(createGoalEntry(db, 'goal1', entryInput('withdrawal', 7000000), 'too-much'), /exceeds/);
    await createGoalEntry(db, 'goal1', entryInput('withdrawal', 500000), 'entry3');
    assert.equal((await getGoal(db, 'goal1')).savedPaise, 6000000);
    await updateGoalEntry(db, 'entry3', entryInput('withdrawal', 6000000));
    assert.equal((await getGoal(db, 'goal1')).status, 'active');
    await assert.rejects(deleteGoalEntry(db, 'entry1'), /negative/);
    await deleteGoalEntry(db, 'entry3');
    await updateGoal(db, 'goal1', goalInput({ targetPaise: 8000000 }));
    assert.equal((await getGoal(db, 'goal1')).status, 'active');
    assert.equal((await getGoalEntries(db, 'goal1')).length, 2);
    await setGoalStatus(db, 'goal1', 'paused');
    assert.equal((await getGoal(db, 'goal1')).status, 'paused');
    await setGoalStatus(db, 'goal1', 'archived');
    await assert.rejects(createGoalEntry(db, 'goal1', entryInput('contribution', 100), 'blocked'), /archived/);
    assert.deepEqual(await getTotals(db), before);
  } finally { db.close(); }
});

test('goal progress, allocation summary and forecast handle completed and past targets', () => {
  assert.deepEqual(goalProgress(6000000, 1800000), { remainingPaise: 4200000, percent: 30, visualPercent: 30 });
  assert.equal(goalProgress(100, 150).visualPercent, 100);
  assert.equal(savingsForecast(6000000, 1800000, '2027-05-01', at(2026, 10, 22)).kind, 'estimate');
  assert.equal(savingsForecast(6000000, 6000000, '2027-05-01', at(2026, 10, 22)).kind, 'complete');
  assert.equal(savingsForecast(6000000, 1800000, '2020-01-01', at(2026, 10, 22)).kind, 'past');
  assert.equal(savingsForecast(6000000, 1800000, null), null);
  const summary = allocationSummary([{ status: 'active', savedPaise: 1800000, targetPaise: 6000000, targetDate: '2027-05-01' },
    { status: 'archived', savedPaise: 300, targetPaise: 1000, targetDate: null }]);
  assert.equal(summary.allocatedPaise, 1800000);
  assert.equal(summary.totalAllocatedPaise, 1800300);
  assert.equal(summary.activeCount, 1);
});

test('backup round trip preserves ledger, accepts v1 backup, and delete-all clears goals', async () => {
  const source = await setup(); const target = await setup();
  try {
    await createGoal(source, goalInput(), 'goal1');
    await createGoalEntry(source, 'goal1', entryInput('contribution', 250000), 'entry1');
    await createGoalEntry(source, 'goal1', entryInput('withdrawal', 50000), 'entry2');
    const backup = await createBackup(source);
    assert.equal(backup.data.savingsGoals.length, 1);
    assert.equal(backup.data.savingsGoalEntries.length, 2);
    assert.throws(() => validateBackup({ ...backup, data: { ...backup.data, savingsGoalEntries: [{ ...backup.data.savingsGoalEntries[0], goal_id: 'missing' }] } }), /broken savings entry/);
    assert.throws(() => validateBackup({ ...backup, data: { ...backup.data, savingsGoalEntries: [{ ...backup.data.savingsGoalEntries[1], amount_paise: 999999 }] } }), /Invalid savings goal balance/);
    await replaceFromBackup(target, backup);
    assert.equal((await getGoal(target, 'goal1')).savedPaise, 200000);
    const older = { ...backup, backupVersion: 1, databaseSchemaVersion: 2,
      data: { ...backup.data } };
    delete older.data.savingsGoals; delete older.data.savingsGoalEntries;
    await replaceFromBackup(target, older);
    assert.equal((await getGoals(target)).length, 0);
    await replaceFromBackup(target, backup);
    await deleteAllFinancialData(target);
    assert.equal((await getGoals(target)).length, 0);
    assert.equal((await getAllTransactions(target)).length, 0);
  } finally { source.close(); target.close(); }
});

test('savings goals and entries persist after database reopen', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'spendwise-goals-'));
  const path = join(directory, 'spendwise.db');
  let db = new Database(path);
  try {
    await migrateDatabase(db);
    await createGoal(db, goalInput(), 'persist-goal');
    await createGoalEntry(db, 'persist-goal', entryInput('contribution', 345678), 'persist-entry');
    db.close();
    db = new Database(path);
    await migrateDatabase(db);
    assert.equal((await getGoal(db, 'persist-goal')).savedPaise, 345678);
    assert.equal((await getGoalEntries(db, 'persist-goal'))[0].id, 'persist-entry');
  } finally {
    db.close();
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw new Error('Test cleanup path escaped the temporary directory');
    rmSync(directory, { recursive: true, force: true });
  }
});
