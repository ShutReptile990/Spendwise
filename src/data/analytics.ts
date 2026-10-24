import type { SQLiteDatabase } from 'expo-sqlite';

import { fillBuckets, groupDaysForChart, reportingBounds, trendBounds, type Bucket, type DateBounds, type ReportingPeriod, type TrendPeriod } from '../domain/analytics.ts';

type Database = Pick<SQLiteDatabase, 'getFirstAsync' | 'getAllAsync'>;
export type FinancialSummary = { incomePaise: number; expensePaise: number; netPaise: number; transactionCount: number; incomeCount: number; expenseCount: number };
export type CategoryExpense = { id: string; name: string; amountPaise: number; count: number };
export type ExpenseItem = { id: string; title: string; categoryName: string; amountPaise: number; transactionDate: number };
type SummaryRow = { income_paise: number; expense_paise: number; transaction_count: number; income_count: number; expense_count: number };
type CategoryRow = { id: string; name: string; amount_paise: number; transaction_count: number };
type BucketRow = { key: string; income_paise: number; expense_paise: number };
type ExpenseRow = { id: string; title: string; category_name: string; amount_paise: number; transaction_date: number };

function safeAmount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Analytics total is too large');
  return value;
}

export async function getFirstTransactionDate(db: Database): Promise<number | null> {
  const row = await db.getFirstAsync<{ first_date: number | null }>('SELECT MIN(transaction_date) AS first_date FROM transactions');
  return row?.first_date ?? null;
}

export async function getFinancialSummary(db: Database, bounds: DateBounds): Promise<FinancialSummary> {
  const row = await db.getFirstAsync<SummaryRow>(`
    SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount_paise ELSE 0 END), 0) AS income_paise,
           COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_paise ELSE 0 END), 0) AS expense_paise,
           COUNT(*) AS transaction_count,
           COALESCE(SUM(CASE WHEN type = 'income' THEN 1 ELSE 0 END), 0) AS income_count,
           COALESCE(SUM(CASE WHEN type = 'expense' THEN 1 ELSE 0 END), 0) AS expense_count
    FROM transactions WHERE transaction_date >= ? AND transaction_date < ?`, bounds.start, bounds.end);
  const incomePaise = safeAmount(row?.income_paise ?? 0);
  const expensePaise = safeAmount(row?.expense_paise ?? 0);
  const netPaise = incomePaise - expensePaise;
  if (!Number.isSafeInteger(netPaise)) throw new Error('Analytics net total is too large');
  return { incomePaise, expensePaise, netPaise, transactionCount: row?.transaction_count ?? 0,
    incomeCount: row?.income_count ?? 0, expenseCount: row?.expense_count ?? 0 };
}

export async function getCategoryExpenseBreakdown(db: Database, bounds: DateBounds): Promise<CategoryExpense[]> {
  const rows = await db.getAllAsync<CategoryRow>(`
    SELECT c.id, c.name, SUM(t.amount_paise) AS amount_paise, COUNT(*) AS transaction_count
    FROM transactions t JOIN categories c ON c.id = t.category_id
    WHERE t.type = 'expense' AND t.transaction_date >= ? AND t.transaction_date < ?
    GROUP BY c.id, c.name ORDER BY amount_paise DESC, c.name ASC`, bounds.start, bounds.end);
  return rows.map((row) => ({ id: row.id, name: row.name, amountPaise: safeAmount(row.amount_paise), count: row.transaction_count }));
}

export async function getLargestExpenses(db: Database, bounds: DateBounds, limit = 5): Promise<ExpenseItem[]> {
  const rows = await db.getAllAsync<ExpenseRow>(`
    SELECT t.id, t.title, c.name AS category_name, t.amount_paise, t.transaction_date
    FROM transactions t JOIN categories c ON c.id = t.category_id
    WHERE t.type = 'expense' AND t.transaction_date >= ? AND t.transaction_date < ?
    ORDER BY t.amount_paise DESC, t.transaction_date DESC, t.id DESC LIMIT ?`, bounds.start, bounds.end, limit);
  return rows.map((row) => ({ id: row.id, title: row.title, categoryName: row.category_name,
    amountPaise: safeAmount(row.amount_paise), transactionDate: row.transaction_date }));
}

export async function getIncomeExpenseBuckets(db: Database, bounds: DateBounds, unit: 'day' | 'month'): Promise<Bucket[]> {
  const format = unit === 'day' ? '%Y-%m-%d' : '%Y-%m';
  const rows = await db.getAllAsync<BucketRow>(`
    SELECT strftime('${format}', transaction_date / 1000, 'unixepoch', 'localtime') AS key,
           COALESCE(SUM(CASE WHEN type = 'income' THEN amount_paise ELSE 0 END), 0) AS income_paise,
           COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_paise ELSE 0 END), 0) AS expense_paise
    FROM transactions WHERE transaction_date >= ? AND transaction_date < ?
    GROUP BY key ORDER BY key`, bounds.start, bounds.end);
  return fillBuckets(bounds, rows.map((row) => ({ key: row.key, incomePaise: safeAmount(row.income_paise), expensePaise: safeAmount(row.expense_paise) })), unit);
}

export async function getPeriodAnalytics(db: Database, period: ReportingPeriod, now = Date.now()) {
  const firstDate = period === 'all' ? await getFirstTransactionDate(db) : null;
  const bounds = reportingBounds(period, now, firstDate);
  const [summary, categories, largestExpenses, buckets] = await Promise.all([
    getFinancialSummary(db, bounds), getCategoryExpenseBreakdown(db, bounds), getLargestExpenses(db, bounds),
    getIncomeExpenseBuckets(db, bounds, period === 'all' ? 'month' : 'day'),
  ]);
  return { bounds, summary, categories, largestExpenses, comparisonBuckets: period === 'all' ? buckets : groupDaysForChart(buckets, period) };
}

export async function getMonthlyComparison(db: Database, now = Date.now()) {
  const currentBounds = reportingBounds('month', now);
  const previousBounds = reportingBounds('lastMonth', now);
  const [current, previous] = await Promise.all([getFinancialSummary(db, currentBounds), getFinancialSummary(db, previousBounds)]);
  return { current, previous, currentBounds, previousBounds };
}

export async function getSpendingTrend(db: Database, period: TrendPeriod, now = Date.now()) {
  const bounds = trendBounds(period, now);
  const buckets = await getIncomeExpenseBuckets(db, bounds, period === '7d' || period === '30d' ? 'day' : 'month');
  return { bounds, buckets };
}
