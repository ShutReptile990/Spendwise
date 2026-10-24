import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createBudget, deleteBudget, evaluateBudgetAlerts, getBudgetHistory, getBudgetOverview, updateBudget } from '../src/data/budgets.ts';
import { DATABASE_VERSION, migrateDatabase } from '../src/data/migrations.ts';
import { createTransaction, deleteTransaction, updateTransaction } from '../src/data/transactions.ts';
import { calculateBudgetUsage, monthBounds, monthFor, shiftMonth } from '../src/domain/budgets.ts';
import { notificationPermissionGranted } from '../src/domain/notification-permission.ts';

class Database {
  constructor() { this.connection = new DatabaseSync(':memory:'); }
  async execAsync(sql) { this.connection.exec(sql); }
  async runAsync(sql, ...params) { const result = this.connection.prepare(sql).run(...params); return { changes: Number(result.changes) }; }
  async getFirstAsync(sql, ...params) { return this.connection.prepare(sql).get(...params) ?? null; }
  async getAllAsync(sql, ...params) { return this.connection.prepare(sql).all(...params); }
  async withTransactionAsync(task) { this.connection.exec('BEGIN'); try { await task(); this.connection.exec('COMMIT'); } catch (error) { this.connection.exec('ROLLBACK'); throw error; } }
  close() { this.connection.close(); }
}
const month = { year: 2024, month: 12 };
const at = (year, m, day) => new Date(year, m - 1, day, 12).getTime();
const input = (type, amountPaise, categoryId, transactionDate) => ({ type, amountPaise, categoryId, transactionDate, title: 'Recorded item', paymentMethod: 'Cash', notes: null });

test('versioned migrations preserve an existing v1 transaction', async () => {
  const db = new Database();
  try {
    await db.execAsync(`CREATE TABLE categories (id TEXT PRIMARY KEY, type TEXT, name TEXT, icon TEXT);
      CREATE TABLE transactions (id TEXT PRIMARY KEY, type TEXT, amount_paise INTEGER, category_id TEXT, transaction_date INTEGER);
      INSERT INTO categories VALUES ('expense-food', 'expense', 'Food', 'food');
      INSERT INTO transactions VALUES ('saved', 'expense', 500, 'expense-food', 1734000000000);
      PRAGMA user_version = 1;`);
    await migrateDatabase(db);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, DATABASE_VERSION);
    assert.equal((await db.getFirstAsync("SELECT amount_paise FROM transactions WHERE id = 'saved'")).amount_paise, 500);
    assert.equal((await getBudgetOverview(db, month)).spentPaise, 500);
  } finally { db.close(); }
});

test('monthly and category budgets stay separate from transactions and enforce uniqueness', async () => {
  const db = new Database();
  try {
    await migrateDatabase(db);
    const overall = await createBudget(db, { ...month, amountPaise: 100000 }, 'overall');
    const food = await createBudget(db, { ...month, amountPaise: 20000, categoryId: 'expense-food' }, 'food');
    assert.equal(overall.categoryId, null);
    assert.equal(food.categoryName, 'Food & Drinks');
    await assert.rejects(createBudget(db, { ...month, amountPaise: 1 }, 'duplicate'));
    await assert.rejects(createBudget(db, { ...month, amountPaise: 1, categoryId: 'expense-food' }, 'duplicate-food'));
    await assert.rejects(createBudget(db, { ...month, amountPaise: 1, categoryId: 'income-salary' }, 'wrong-type'));
    await assert.rejects(createBudget(db, { ...month, amountPaise: 0 }, 'zero'));
    await assert.rejects(createBudget(db, { ...month, amountPaise: -100 }, 'negative'));
    await assert.rejects(createBudget(db, { ...month, amountPaise: Number.MAX_SAFE_INTEGER + 1 }, 'unsafe'));
    assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM transactions')).count, 0);
    await updateBudget(db, 'overall', 120000);
    assert.equal((await getBudgetOverview(db, month)).overall.amountPaise, 120000);
    assert.deepEqual((await getBudgetHistory(db)).map(({ year, month }) => [year, month]), [[2024, 12]]);
    assert.equal(await deleteBudget(db, 'overall'), true);
    assert.equal((await getBudgetOverview(db, month)).overall, null);
  } finally { db.close(); }
});

test('usage recalculates after income, expense edits, category moves, deletion, and year boundary', async () => {
  const db = new Database();
  try {
    await migrateDatabase(db);
    await createBudget(db, { ...month, amountPaise: 10000 }, 'overall');
    await createBudget(db, { ...month, amountPaise: 5000, categoryId: 'expense-food' }, 'food');
    await createBudget(db, { ...month, amountPaise: 5000, categoryId: 'expense-transport' }, 'transport');
    await createTransaction(db, input('income', 500000, 'income-salary', at(2024, 12, 5)), 'income');
    assert.equal((await getBudgetOverview(db, month)).spentPaise, 0);
    await createTransaction(db, input('expense', 4000, 'expense-food', at(2024, 12, 5)), 'expense');
    let overview = await getBudgetOverview(db, month);
    assert.equal(overview.overall.remainingPaise, 6000);
    assert.equal(overview.categories[0].spentPaise, 4000);
    await updateTransaction(db, 'expense', input('expense', 8000, 'expense-transport', at(2024, 12, 6)));
    overview = await getBudgetOverview(db, month);
    assert.equal(overview.categories.find((item) => item.categoryId === 'expense-food').spentPaise, 0);
    assert.equal(overview.categories.find((item) => item.categoryId === 'expense-transport').status, 'Exceeded');
    await updateTransaction(db, 'expense', input('expense', 8000, 'expense-transport', at(2025, 1, 1)));
    assert.equal((await getBudgetOverview(db, month)).spentPaise, 0);
    assert.equal((await getBudgetOverview(db, { year: 2025, month: 1 })).spentPaise, 8000);
    await deleteTransaction(db, 'expense');
    assert.equal((await getBudgetOverview(db, { year: 2025, month: 1 })).spentPaise, 0);
  } finally { db.close(); }
});

test('exact alert thresholds are claimed once and suppress duplicate 80% when jumping to 100%', async () => {
  const db = new Database();
  try {
    await migrateDatabase(db);
    await createBudget(db, { ...month, amountPaise: 10001 }, 'overall');
    assert.equal(calculateBudgetUsage(10001, 8000).status, 'On Track');
    assert.equal(calculateBudgetUsage(10001, 8001).status, 'Near Limit');
    assert.equal(calculateBudgetUsage(10001, 10001).status, 'Limit Reached');
    assert.equal(calculateBudgetUsage(10001, 10002).status, 'Exceeded');
    await createTransaction(db, input('expense', 8001, 'expense-food', at(2024, 12, 5)), 'expense');
    assert.deepEqual((await evaluateBudgetAlerts(db, month)).map(({ threshold }) => threshold), [80]);
    assert.deepEqual(await evaluateBudgetAlerts(db, month), []);
    await updateTransaction(db, 'expense', input('expense', 11000, 'expense-food', at(2024, 12, 5)));
    assert.deepEqual((await evaluateBudgetAlerts(db, month)).map(({ threshold }) => threshold), [100]);
    assert.deepEqual(await evaluateBudgetAlerts(db, month), []);
    await deleteBudget(db, 'overall');
    assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM budget_alert_history')).count, 0);
  } finally { db.close(); }
});

test('a newly configured category limit recalculates alerts without duplicate notices', async () => {
  const db = new Database();
  try {
    await migrateDatabase(db);
    await createTransaction(db, input('expense', 12000, 'expense-food', at(2024, 12, 5)), 'expense');
    await createBudget(db, { ...month, amountPaise: 20000, categoryId: 'expense-food' }, 'food');
    assert.deepEqual(await evaluateBudgetAlerts(db, month), []);
    await updateBudget(db, 'food', 10000);
    assert.deepEqual((await evaluateBudgetAlerts(db, month)).map(({ budget, threshold }) => [budget.categoryName, threshold]), [['Food & Drinks', 100]]);
    assert.deepEqual(await evaluateBudgetAlerts(db, month), []);
    assert.deepEqual((await db.getAllAsync('SELECT threshold FROM budget_alert_history ORDER BY threshold')).map(({ threshold }) => threshold), [80, 100]);
  } finally { db.close(); }
});

test('month arithmetic and empty states are safe', async () => {
  assert.deepEqual(shiftMonth(month, 1), { year: 2025, month: 1 });
  assert.deepEqual(shiftMonth(month, -11), { year: 2024, month: 1 });
  assert.deepEqual(monthFor(new Date(2025, 0, 1)), { year: 2025, month: 1 });
  assert.equal(monthBounds(month).end, new Date(2025, 0, 1).getTime());
  const db = new Database();
  try {
    await migrateDatabase(db);
    const overview = await getBudgetOverview(db, month);
    assert.equal(overview.overall, null);
    assert.deepEqual(overview.categories, []);
    assert.equal(overview.spentPaise, 0);
    assert.deepEqual(await evaluateBudgetAlerts(db, month), []);
  } finally { db.close(); }
});

test('denied notification permission prevents delivery and does not reprompt when blocked', async () => {
  let requests = 0;
  const denied = await notificationPermissionGranted(
    async () => ({ granted: false, canAskAgain: false }),
    async () => { requests++; return { granted: true, canAskAgain: false }; },
  );
  assert.equal(denied, false);
  assert.equal(requests, 0);
  const declined = await notificationPermissionGranted(
    async () => ({ granted: false, canAskAgain: true }),
    async () => { requests++; return { granted: false, canAskAgain: false }; },
  );
  assert.equal(declined, false);
  assert.equal(requests, 1);
});
