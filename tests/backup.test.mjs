import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, pbkdf2Sync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { BACKUP_VERSION, createBackup, parseBackup, replaceFromBackup, validateBackup } from '../src/data/backup.ts';
import { migrateDatabase } from '../src/data/migrations.ts';
import { getAllTransactions, getTotals } from '../src/data/transactions.ts';
import { transactionsToCsv } from '../src/domain/csv-export.ts';
import { defaultTransactionFilters } from '../src/domain/transaction-filters.ts';
import { derivePinVerifier, equalVerifier, retryDelayMs, validPin } from '../src/domain/pin.ts';

class TestDatabase {
  constructor() { this.connection = new DatabaseSync(':memory:'); this.failOn = null; }
  async execAsync(sql) { this.connection.exec(sql); }
  async runAsync(sql, ...values) {
    if (this.failOn && sql.includes(this.failOn)) throw new Error('Injected write failure');
    const result = this.connection.prepare(sql).run(...values);
    return { changes: Number(result.changes) };
  }
  async getFirstAsync(sql, ...values) { return this.connection.prepare(sql).get(...values) ?? null; }
  async getAllAsync(sql, ...values) { return this.connection.prepare(sql).all(...values); }
  async withTransactionAsync(task) { return this.withExclusiveTransactionAsync(task); }
  async withExclusiveTransactionAsync(task) {
    this.connection.exec('BEGIN IMMEDIATE');
    try { await task(this); this.connection.exec('COMMIT'); }
    catch (error) { this.connection.exec('ROLLBACK'); throw error; }
  }
  close() { this.connection.close(); }
}

async function setup() { const db = new TestDatabase(); await migrateDatabase(db); return db; }
async function seed(db) {
  await db.runAsync('INSERT INTO categories (id, type, name, icon) VALUES (?, ?, ?, ?)', 'custom-tea', 'expense', 'Tea', 'other');
  await db.runAsync(`INSERT INTO transactions (id, type, amount_paise, title, category_id, payment_method, notes, transaction_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 'tx-1', 'expense', 12345, '=SUM(1,2)', 'custom-tea', 'UPI', 'line 1\n"quoted"', 1760918400000, 1760918400000, 1760918400000);
  await db.runAsync(`INSERT INTO budgets (id, year, month, category_id, amount_paise, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, 'budget-1', 2025, 10, 'custom-tea', 50000, 1760918400000, 1760918400000);
  await db.runAsync('INSERT INTO budget_alert_history (budget_id, threshold, triggered_at) VALUES (?, ?, ?)', 'budget-1', 80, 1760918400000);
}

test('empty database backup is valid and preserves seeded categories', async () => {
  const db = await setup();
  try {
    const backup = await createBackup(db, new Date('2026-10-22T00:00:00Z'));
    assert.equal(backup.backupVersion, BACKUP_VERSION);
    assert.equal(backup.createdAt, '2026-10-22T00:00:00.000Z');
    assert.equal(backup.data.transactions.length, 0);
    assert.equal(backup.data.categories.length, 15);
    assert.equal(JSON.stringify(parseBackup(JSON.stringify(backup))), JSON.stringify(backup));
  } finally { db.close(); }
});

test('backup and replace preserve IDs, category links, budgets, alerts and totals', async () => {
  const source = await setup(); const target = await setup();
  try {
    await seed(source);
    const backup = await createBackup(source);
    assert.equal(backup.data.transactions[0].amount_paise, 12345);
    await target.runAsync(`INSERT INTO transactions (id, type, amount_paise, title, category_id, payment_method, notes, transaction_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 'old', 'income', 999, 'Old', 'income-salary', 'Cash', null, 1760918400000, 1760918400000, 1760918400000);
    await replaceFromBackup(target, parseBackup(JSON.stringify(backup)));
    assert.equal((await getAllTransactions(target)).length, 1);
    assert.equal((await getAllTransactions(target))[0].id, 'tx-1');
    assert.equal((await getAllTransactions(target))[0].categoryId, 'custom-tea');
    assert.deepEqual(await getTotals(target), await getTotals(source));
    assert.equal((await target.getFirstAsync('SELECT amount_paise FROM budgets WHERE id = ?', 'budget-1')).amount_paise, 50000);
    assert.equal((await target.getFirstAsync('SELECT threshold FROM budget_alert_history WHERE budget_id = ?', 'budget-1')).threshold, 80);
    assert.equal((await target.getAllAsync('PRAGMA foreign_key_check')).length, 0);
  } finally { source.close(); target.close(); }
});

test('invalid JSON, unsupported version, bad amounts, duplicates and broken references are rejected before writes', async () => {
  const db = await setup();
  try {
    await seed(db);
    const backup = await createBackup(db);
    assert.throws(() => parseBackup('{oops'), /Invalid JSON/);
    assert.throws(() => parseBackup(JSON.stringify({ ...backup, backupVersion: 99 })), /Unsupported backup/);
    assert.throws(() => validateBackup({ ...backup, data: { ...backup.data, transactions: [{ ...backup.data.transactions[0], amount_paise: -1 }] } }), /Invalid backup transaction/);
    assert.throws(() => validateBackup({ ...backup, data: { ...backup.data, transactions: [backup.data.transactions[0], backup.data.transactions[0]] } }), /Duplicate transaction/);
    assert.throws(() => validateBackup({ ...backup, data: { ...backup.data, transactions: [{ ...backup.data.transactions[0], category_id: 'missing' }] } }), /Broken transaction category/);
    assert.equal((await getAllTransactions(db)).length, 1);
  } finally { db.close(); }
});

test('restore rolls back every deletion and insertion after a write failure', async () => {
  const source = await setup(); const target = await setup();
  try {
    await seed(source); await seed(target);
    const before = await createBackup(target);
    const backup = await createBackup(source);
    target.failOn = 'INSERT INTO transactions';
    await assert.rejects(replaceFromBackup(target, backup), /Injected write failure/);
    target.failOn = null;
    assert.deepEqual((await createBackup(target)).data, before.data);
  } finally { source.close(); target.close(); }
});

test('CSV escapes text and formulas, keeps two decimals, and shares transaction date filtering', async () => {
  const db = await setup();
  try {
    await seed(db);
    const rows = await getAllTransactions(db);
    const all = transactionsToCsv(rows, defaultTransactionFilters());
    assert.match(all, /^\uFEFF"Transaction ID"/);
    assert.match(all, /"'=SUM\(1,2\)"/);
    assert.match(all, /"line 1\n""quoted"""/);
    assert.match(all, /"123\.45"/);
    const custom = defaultTransactionFilters();
    custom.datePreset = 'custom';
    custom.customStartDate = new Date(2025, 9, 20).getTime();
    custom.customEndDate = new Date(2025, 9, 20).getTime();
    assert.equal(transactionsToCsv(rows, custom).split('\r\n').length, 3);
    custom.customStartDate = new Date(2025, 9, 21).getTime();
    custom.customEndDate = new Date(2025, 9, 21).getTime();
    assert.equal(transactionsToCsv(rows, custom).split('\r\n').length, 2);
    assert.equal(transactionsToCsv([], defaultTransactionFilters()).split('\r\n').length, 2);
  } finally { db.close(); }
});

test('PIN verifier accepts matching PIN, rejects incorrect PIN and applies retry delays', async () => {
  const digest = async (input) => Uint8Array.from(createHash('sha256').update(input).digest());
  const salt = '0123456789abcdef0123456789abcdef';
  const verifier = await derivePinVerifier('493218', salt, digest);
  assert.equal(verifier, pbkdf2Sync('493218', Buffer.from(salt, 'hex'), 4096, 32, 'sha256').toString('hex'));
  assert.equal(equalVerifier(verifier, await derivePinVerifier('493218', salt, digest)), true);
  assert.equal(equalVerifier(verifier, await derivePinVerifier('493219', salt, digest)), false);
  assert.equal(validPin('123'), false);
  assert.equal(validPin('123456'), true);
  assert.equal(retryDelayMs(4), 0);
  assert.equal(retryDelayMs(5), 30_000);
  assert.equal(retryDelayMs(20), 300_000);
});
