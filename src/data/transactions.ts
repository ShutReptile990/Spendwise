import type { SQLiteDatabase } from 'expo-sqlite';

import { paymentMethods, type Category, type Totals, type TransactionInput, type TransactionRecord, type TransactionType } from './types.ts';

type Database = Pick<SQLiteDatabase, 'getAllAsync' | 'getFirstAsync' | 'runAsync'>;

type TransactionRow = {
  id: string;
  type: TransactionType;
  amount_paise: number;
  title: string;
  category_id: string;
  category_name: string;
  category_icon: string;
  payment_method: TransactionRecord['paymentMethod'];
  notes: string | null;
  transaction_date: number;
  created_at: number;
  updated_at: number;
};

const joinedFields = `
  SELECT t.id, t.type, t.amount_paise, t.title, t.category_id,
         c.name AS category_name, c.icon AS category_icon,
         t.payment_method, t.notes, t.transaction_date, t.created_at, t.updated_at
  FROM transactions t JOIN categories c ON c.id = t.category_id
`;

function mapTransaction(row: TransactionRow): TransactionRecord {
  return {
    id: row.id,
    type: row.type,
    amountPaise: row.amount_paise,
    title: row.title,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryIcon: row.category_icon,
    paymentMethod: row.payment_method,
    notes: row.notes,
    transactionDate: row.transaction_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeInput(input: TransactionInput): TransactionInput {
  const title = input.title.trim();
  const notes = input.notes?.trim() || null;
  if (input.type !== 'income' && input.type !== 'expense') throw new Error('Choose income or expense');
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0) throw new Error('Enter an amount greater than zero');
  if (!title || title.length > 120) throw new Error('Enter a title up to 120 characters');
  if (!input.categoryId) throw new Error('Choose a category');
  if (!paymentMethods.includes(input.paymentMethod)) throw new Error('Choose a payment method');
  if (notes && notes.length > 1000) throw new Error('Notes cannot exceed 1,000 characters');
  if (!Number.isSafeInteger(input.transactionDate) || input.transactionDate <= 0 || input.transactionDate > Date.now()) {
    throw new Error('Choose a valid date and time');
  }
  return { ...input, title, notes };
}

export async function getCategories(db: Database, type: TransactionType): Promise<Category[]> {
  return db.getAllAsync<Category>('SELECT id, type, name, icon FROM categories WHERE type = ? ORDER BY rowid', type);
}

export async function createTransaction(
  db: Database,
  input: TransactionInput,
  id: string,
  now = Date.now()
): Promise<TransactionRecord> {
  if (!id) throw new Error('Transaction ID is required');
  const value = normalizeInput(input);
  await db.runAsync(
    `INSERT INTO transactions
      (id, type, amount_paise, title, category_id, payment_method, notes, transaction_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, value.type, value.amountPaise, value.title, value.categoryId,
    value.paymentMethod, value.notes, value.transactionDate, now, now
  );
  const created = await getTransactionById(db, id);
  if (!created) throw new Error('Transaction could not be loaded after saving');
  return created;
}

export async function getAllTransactions(db: Database, limit?: number): Promise<TransactionRecord[]> {
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0)) throw new Error('Invalid transaction limit');
  const sql = `${joinedFields} ORDER BY t.transaction_date DESC, t.created_at DESC, t.id DESC${limit ? ' LIMIT ?' : ''}`;
  const rows = limit
    ? await db.getAllAsync<TransactionRow>(sql, limit)
    : await db.getAllAsync<TransactionRow>(sql);
  return rows.map(mapTransaction);
}

export async function getTransactionById(db: Database, id: string): Promise<TransactionRecord | null> {
  const row = await db.getFirstAsync<TransactionRow>(`${joinedFields} WHERE t.id = ?`, id);
  return row ? mapTransaction(row) : null;
}

export async function updateTransaction(db: Database, id: string, input: TransactionInput): Promise<TransactionRecord> {
  const previous = await getTransactionById(db, id);
  if (!previous) throw new Error('Transaction not found');
  const value = normalizeInput(input);
  const updatedAt = Math.max(Date.now(), previous.updatedAt + 1);
  const result = await db.runAsync(
    `UPDATE transactions SET type = ?, amount_paise = ?, title = ?, category_id = ?,
      payment_method = ?, notes = ?, transaction_date = ?, updated_at = ? WHERE id = ?`,
    value.type, value.amountPaise, value.title, value.categoryId,
    value.paymentMethod, value.notes, value.transactionDate, updatedAt, id
  );
  if (result.changes !== 1) throw new Error('Transaction was not updated');
  const updated = await getTransactionById(db, id);
  if (!updated) throw new Error('Transaction could not be loaded after updating');
  return updated;
}

export async function deleteTransaction(db: Database, id: string): Promise<boolean> {
  const result = await db.runAsync('DELETE FROM transactions WHERE id = ?', id);
  return result.changes === 1;
}

export async function getTotals(db: Database): Promise<Totals> {
  const row = await db.getFirstAsync<{ income_paise: number; expense_paise: number }>(`
    SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount_paise ELSE 0 END), 0) AS income_paise,
           COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_paise ELSE 0 END), 0) AS expense_paise
    FROM transactions
  `);
  const incomePaise = row?.income_paise ?? 0;
  const expensePaise = row?.expense_paise ?? 0;
  if (!Number.isSafeInteger(incomePaise) || !Number.isSafeInteger(expensePaise)) throw new Error('Recorded total is too large');
  const balancePaise = incomePaise - expensePaise;
  if (!Number.isSafeInteger(balancePaise)) throw new Error('Recorded balance is too large');
  return { incomePaise, expensePaise, balancePaise };
}

export async function getTotalIncome(db: Database): Promise<number> {
  return (await getTotals(db)).incomePaise;
}

export async function getTotalExpenses(db: Database): Promise<number> {
  return (await getTotals(db)).expensePaise;
}

export async function getNetBalance(db: Database): Promise<number> {
  return (await getTotals(db)).balancePaise;
}
