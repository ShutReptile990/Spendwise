import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { DATABASE_VERSION, migrateDatabase } from '../src/data/migrations.ts';
import {
  createTransaction, deleteTransaction, getAllTransactions, getCategories,
  getNetBalance, getTotalExpenses, getTotalIncome, getTransactionById,
  getTotals, updateTransaction,
} from '../src/data/transactions.ts';

class AsyncSQLiteAdapter {
  constructor(path = ':memory:') { this.connection = new DatabaseSync(path); }
  async execAsync(sql) { this.connection.exec(sql); }
  async runAsync(sql, ...params) {
    const result = this.connection.prepare(sql).run(...params);
    return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
  }
  async getFirstAsync(sql, ...params) { return this.connection.prepare(sql).get(...params) ?? null; }
  async getAllAsync(sql, ...params) { return this.connection.prepare(sql).all(...params); }
  async withTransactionAsync(task) {
    this.connection.exec('BEGIN');
    try { await task(); this.connection.exec('COMMIT'); }
    catch (error) { this.connection.exec('ROLLBACK'); throw error; }
  }
  close() { this.connection.close(); }
}

const expense = (overrides = {}) => ({
  type: 'expense', amountPaise: 12005, title: 'College Canteen',
  categoryId: 'expense-food', paymentMethod: 'UPI', notes: "Today's lunch",
  transactionDate: Date.now() - 120000, ...overrides,
});

test('migration creates constrained tables, indexes, and seeded categories', async () => {
  const db = new AsyncSQLiteAdapter();
  try {
    await migrateDatabase(db);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, DATABASE_VERSION);
    assert.equal((await db.getFirstAsync('PRAGMA foreign_keys')).foreign_keys, 1);
    assert.equal((await getCategories(db, 'expense')).length, 9);
    assert.equal((await getCategories(db, 'income')).length, 6);
    const indexes = await db.getAllAsync("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_transactions_%'");
    assert.deepEqual(indexes.map((row) => row.name).sort(), ['idx_transactions_category', 'idx_transactions_date', 'idx_transactions_type']);
    await migrateDatabase(db);
    assert.equal((await getCategories(db, 'expense')).length, 9);
  } finally { db.close(); }
});

test('migration protects an unversioned existing financial table', async () => {
  const db = new AsyncSQLiteAdapter();
  try {
    await db.execAsync('CREATE TABLE transactions (legacy_value TEXT); INSERT INTO transactions VALUES (\'keep me\');');
    await assert.rejects(migrateDatabase(db), /stopped to protect/);
    assert.equal((await db.getFirstAsync('SELECT legacy_value FROM transactions')).legacy_value, 'keep me');
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 0);
  } finally { db.close(); }
});

test('create, read, update, delete, ordering and totals use stored paise', async () => {
  const db = new AsyncSQLiteAdapter();
  try {
    await migrateDatabase(db);
    await createTransaction(db, expense(), 'expense-1');
    await createTransaction(db, {
      type: 'income', amountPaise: 500000, title: 'Freelance Payment', categoryId: 'income-freelance',
      paymentMethod: 'Bank Transfer', notes: null, transactionDate: Date.now() - 1000,
    }, 'income-1');
    assert.deepEqual((await getAllTransactions(db)).map((row) => row.id), ['income-1', 'expense-1']);
    assert.deepEqual(await getTotals(db), { incomePaise: 500000, expensePaise: 12005, balancePaise: 487995 });
    assert.equal(await getTotalIncome(db), 500000);
    assert.equal(await getTotalExpenses(db), 12005);
    assert.equal(await getNetBalance(db), 487995);
    const before = await getTransactionById(db, 'expense-1');
    const updated = await updateTransaction(db, 'expense-1', expense({ amountPaise: 15050, title: '  Dinner  ' }));
    assert.equal(updated.title, 'Dinner');
    assert.equal(updated.amountPaise, 15050);
    assert.ok(updated.updatedAt > before.updatedAt);
    assert.equal(await deleteTransaction(db, 'income-1'), true);
    assert.equal(await getTransactionById(db, 'income-1'), null);
    assert.equal(await getNetBalance(db), -15050);
  } finally { db.close(); }
});

test('invalid rows are rejected by validation and SQLite constraints', async () => {
  const db = new AsyncSQLiteAdapter();
  try {
    await migrateDatabase(db);
    await assert.rejects(createTransaction(db, expense({ amountPaise: 0 }), 'bad-zero'));
    await assert.rejects(createTransaction(db, expense({ title: ' ' }), 'bad-title'));
    await assert.rejects(createTransaction(db, expense({ categoryId: 'income-salary' }), 'bad-category'));
    await assert.rejects(createTransaction(db, expense({ categoryId: 'missing' }), 'bad-fk'));
    await createTransaction(db, expense(), 'unique-id');
    await assert.rejects(createTransaction(db, expense(), 'unique-id'));
    assert.equal((await getAllTransactions(db)).length, 1);
  } finally { db.close(); }
});

test('records persist after closing and reopening the database', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'spendwise-test-'));
  const path = join(directory, 'spendwise.db');
  let db = new AsyncSQLiteAdapter(path);
  try {
    await migrateDatabase(db);
    await createTransaction(db, expense(), 'persistent-id');
    db.close();
    db = new AsyncSQLiteAdapter(path);
    await migrateDatabase(db);
    assert.equal((await getTransactionById(db, 'persistent-id')).amountPaise, 12005);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
