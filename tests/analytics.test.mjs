import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { getFinancialSummary, getMonthlyComparison, getPeriodAnalytics, getSpendingTrend } from '../src/data/analytics.ts';
import { migrateDatabase } from '../src/data/migrations.ts';
import { createTransaction, deleteTransaction, updateTransaction } from '../src/data/transactions.ts';
import { averageDailyPaise, calendarDays, fillBuckets, mostFrequentCategory, percentOf, reportingBounds, spendingChange, trendBounds } from '../src/domain/analytics.ts';

class Database {
  constructor() { this.connection = new DatabaseSync(':memory:'); }
  async execAsync(sql) { this.connection.exec(sql); }
  async runAsync(sql, ...params) { const result = this.connection.prepare(sql).run(...params); return { changes: Number(result.changes) }; }
  async getFirstAsync(sql, ...params) { return this.connection.prepare(sql).get(...params) ?? null; }
  async getAllAsync(sql, ...params) { return this.connection.prepare(sql).all(...params); }
  async withTransactionAsync(task) { this.connection.exec('BEGIN'); try { await task(); this.connection.exec('COMMIT'); } catch (error) { this.connection.exec('ROLLBACK'); throw error; } }
  close() { this.connection.close(); }
}
const at = (year, month, day, hour = 12) => new Date(year, month - 1, day, hour).getTime();
const now = at(2024, 3, 15);
const record = (type, amountPaise, categoryId, transactionDate, title) => ({ type, amountPaise, categoryId, transactionDate, title, paymentMethod: 'UPI', notes: null });

async function seeded() {
  const db = new Database();
  await migrateDatabase(db);
  await createTransaction(db, record('income', 100000, 'income-salary', at(2024, 3, 1, 0), 'Salary'), 'income');
  await createTransaction(db, record('expense', 20050, 'expense-food', at(2024, 3, 1, 0), 'Lunch'), 'food-1');
  await createTransaction(db, record('expense', 10000, 'expense-food', at(2024, 3, 4), 'Coffee'), 'food-2');
  await createTransaction(db, record('expense', 50000, 'expense-rent', at(2024, 3, 14), 'Rent'), 'rent');
  await createTransaction(db, record('expense', 30000, 'expense-rent', at(2024, 2, 29), 'Previous rent'), 'previous');
  await createTransaction(db, record('expense', 2500, 'expense-food', at(2023, 3, 14), 'Old lunch'), 'old');
  await createTransaction(db, record('expense', 9000, 'expense-food', at(2024, 4, 1, 0), 'April lunch'), 'april');
  return db;
}

test('all-time net and selected month totals come from stored paise', async () => {
  const db = await seeded();
  try {
    const march = await getPeriodAnalytics(db, 'month', now);
    assert.deepEqual(march.summary, { incomePaise: 100000, expensePaise: 80050, netPaise: 19950, transactionCount: 4, incomeCount: 1, expenseCount: 3 });
    const all = await getPeriodAnalytics(db, 'all', at(2024, 4, 2));
    assert.equal(all.summary.incomePaise, 100000);
    assert.equal(all.summary.expensePaise, 121550);
    assert.equal(all.summary.netPaise, -21550);
    assert.equal(all.comparisonBuckets[0].key, '2023-03');
    assert.equal(all.comparisonBuckets.at(-1).key, '2024-04');
  } finally { db.close(); }
});

test('category totals, shares, top expenses and transaction counts', async () => {
  const db = await seeded();
  try {
    const data = await getPeriodAnalytics(db, 'month', now);
    assert.deepEqual(data.categories.map((row) => [row.name, row.amountPaise, row.count]), [['Rent', 50000, 1], ['Food & Drinks', 30050, 2]]);
    assert.equal(percentOf(50000, 80050).toFixed(1), '62.5');
    assert.equal(data.largestExpenses[0].title, 'Rent');
    assert.equal(data.largestExpenses.every((row) => row.amountPaise <= 50000), true);
    assert.equal(mostFrequentCategory(data.categories).name, 'Food & Drinks');
    assert.equal(mostFrequentCategory([{ name: 'B', amountPaise: 200, count: 2 }, { name: 'A', amountPaise: 300, count: 2 }]).name, 'A');
  } finally { db.close(); }
});

test('local date boundaries include midnight at start and exclude next period', async () => {
  const db = await seeded();
  try {
    const bounds = reportingBounds('month', now);
    assert.equal(bounds.start, at(2024, 3, 1, 0));
    assert.equal(bounds.end, at(2024, 3, 16, 0));
    const march = await getFinancialSummary(db, bounds);
    assert.equal(march.transactionCount, 4);
    const previous = await getPeriodAnalytics(db, 'lastMonth', now);
    assert.equal(previous.summary.expensePaise, 30000);
    assert.equal(calendarDays(previous.bounds), 29);
    assert.equal(averageDailyPaise(march.expensePaise, bounds), Math.round(80050 / 15));
  } finally { db.close(); }
});

test('weekly and monthly comparison groups fill zero-spending dates', async () => {
  const db = await seeded();
  try {
    const week = await getPeriodAnalytics(db, 'week', now);
    assert.equal(week.comparisonBuckets.length, 5);
    assert.deepEqual(week.comparisonBuckets.map((row) => row.expensePaise), [0, 0, 0, 50000, 0]);
    const month = await getPeriodAnalytics(db, 'month', now);
    assert.deepEqual(month.comparisonBuckets.map((row) => row.expensePaise), [30050, 50000, 0]);
    assert.equal(month.comparisonBuckets[0].incomePaise, 100000);
  } finally { db.close(); }
});

test('trend groups daily and monthly, preserving zero intervals', async () => {
  const db = await seeded();
  try {
    const week = await getSpendingTrend(db, '7d', now);
    assert.equal(week.buckets.length, 7);
    assert.equal(week.buckets.reduce((sum, row) => sum + row.expensePaise, 0), 50000);
    assert.equal(week.buckets.filter((row) => row.expensePaise === 0).length, 6);
    const six = await getSpendingTrend(db, '6m', now);
    assert.equal(six.buckets.length, 6);
    assert.equal(six.buckets.at(-1).expensePaise, 80050);
    assert.equal(trendBounds('30d', now).start, at(2024, 2, 15, 0));
  } finally { db.close(); }
});

test('monthly comparison handles zero previous expenses', async () => {
  const db = await seeded();
  try {
    const comparison = await getMonthlyComparison(db, now);
    assert.equal(comparison.previous.expensePaise, 30000);
    assert.equal(spendingChange(comparison.current.expensePaise, comparison.previous.expensePaise).direction, 'increase');
    assert.equal(spendingChange(0, 0), null);
    assert.equal(spendingChange(2500, 5000).direction, 'decrease');
  } finally { db.close(); }
});

test('empty database and empty reporting period remain safe', async () => {
  const db = new Database();
  try {
    await migrateDatabase(db);
    const data = await getPeriodAnalytics(db, 'month', now);
    assert.equal(data.summary.transactionCount, 0);
    assert.deepEqual(data.categories, []);
    assert.deepEqual(data.largestExpenses, []);
    assert.ok(data.comparisonBuckets.every((row) => row.incomePaise === 0 && row.expensePaise === 0));
    assert.equal(percentOf(1, 0), 0);
    assert.equal(averageDailyPaise(0, data.bounds), 0);
    assert.equal(fillBuckets({ start: at(2024, 3, 1, 0), end: at(2024, 3, 3, 0), label: '' }, [], 'day').length, 2);
  } finally { db.close(); }
});

test('refetching after add, edit and delete returns fresh dashboard and analytics totals', async () => {
  const db = new Database();
  try {
    await migrateDatabase(db);
    const bounds = reportingBounds('month', now);
    assert.equal((await getFinancialSummary(db, bounds)).expensePaise, 0);
    await createTransaction(db, record('expense', 10050, 'expense-food', at(2024, 3, 5), 'Snack'), 'snack');
    assert.equal((await getFinancialSummary(db, bounds)).expensePaise, 10050);
    assert.equal((await getPeriodAnalytics(db, 'month', now)).categories[0].amountPaise, 10050);
    await updateTransaction(db, 'snack', record('expense', 20075, 'expense-food', at(2024, 3, 5), 'Snack'));
    assert.equal((await getFinancialSummary(db, bounds)).expensePaise, 20075);
    assert.equal((await getPeriodAnalytics(db, 'month', now)).categories[0].amountPaise, 20075);
    await deleteTransaction(db, 'snack');
    assert.equal((await getFinancialSummary(db, bounds)).expensePaise, 0);
    assert.deepEqual((await getPeriodAnalytics(db, 'month', now)).categories, []);
  } finally { db.close(); }
});
