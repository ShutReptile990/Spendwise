import type { SQLiteDatabase } from 'expo-sqlite';

import { calculateBudgetUsage, monthBounds, type BudgetMonth } from '../domain/budgets.ts';

type Database = Pick<SQLiteDatabase, 'getAllAsync' | 'getFirstAsync' | 'runAsync'>;
type BudgetRow = { id: string; year: number; month: number; category_id: string | null; amount_paise: number; created_at: number; updated_at: number; category_name: string | null; category_icon: string | null };
type SpendRow = { category_id: string; spent_paise: number };
export type Budget = { id: string; year: number; month: number; categoryId: string | null; amountPaise: number; createdAt: number; updatedAt: number; categoryName: string | null; categoryIcon: string | null };
export type BudgetUsage = Budget & { spentPaise: number; remainingPaise: number; usedPercent: number; progress: number; status: ReturnType<typeof calculateBudgetUsage>['status'] };
export type BudgetOverview = { month: BudgetMonth; spentPaise: number; overall: BudgetUsage | null; categories: BudgetUsage[] };
export type BudgetAlert = { budget: BudgetUsage; threshold: 80 | 100 };

const fields = `SELECT b.id, b.year, b.month, b.category_id, b.amount_paise, b.created_at, b.updated_at,
  c.name AS category_name, c.icon AS category_icon FROM budgets b LEFT JOIN categories c ON c.id = b.category_id`;

function mapBudget(row: BudgetRow): Budget {
  return { id: row.id, year: row.year, month: row.month, categoryId: row.category_id,
    amountPaise: row.amount_paise, createdAt: row.created_at, updatedAt: row.updated_at,
    categoryName: row.category_name, categoryIcon: row.category_icon };
}

function validateAmount(amountPaise: number) {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new Error('Enter a budget greater than zero');
}

export async function createBudget(db: Database, input: BudgetMonth & { amountPaise: number; categoryId?: string | null }, id: string, now = Date.now()): Promise<Budget> {
  monthBounds(input);
  validateAmount(input.amountPaise);
  if (!id) throw new Error('Budget ID is required');
  await db.runAsync(`INSERT INTO budgets (id, year, month, category_id, amount_paise, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, id, input.year, input.month, input.categoryId ?? null, input.amountPaise, now, now);
  const saved = await db.getFirstAsync<BudgetRow>(`${fields} WHERE b.id = ?`, id);
  if (!saved) throw new Error('Budget could not be loaded after saving');
  return mapBudget(saved);
}

export async function updateBudget(db: Database, id: string, amountPaise: number, now = Date.now()): Promise<void> {
  validateAmount(amountPaise);
  const result = await db.runAsync('UPDATE budgets SET amount_paise = ?, updated_at = ? WHERE id = ?', amountPaise, now, id);
  if (result.changes !== 1) throw new Error('Budget not found');
}

export async function deleteBudget(db: Database, id: string): Promise<boolean> {
  return (await db.runAsync('DELETE FROM budgets WHERE id = ?', id)).changes === 1;
}

export async function getMonthlyBudget(db: Database, value: BudgetMonth): Promise<Budget | null> {
  monthBounds(value);
  const row = await db.getFirstAsync<BudgetRow>(`${fields} WHERE b.year = ? AND b.month = ? AND b.category_id IS NULL`, value.year, value.month);
  return row ? mapBudget(row) : null;
}

export async function getCategoryBudgets(db: Database, value: BudgetMonth): Promise<Budget[]> {
  monthBounds(value);
  const rows = await db.getAllAsync<BudgetRow>(`${fields} WHERE b.year = ? AND b.month = ? AND b.category_id IS NOT NULL ORDER BY c.name`, value.year, value.month);
  return rows.map(mapBudget);
}

export async function getBudgetHistory(db: Database): Promise<BudgetMonth[]> {
  return db.getAllAsync<BudgetMonth>('SELECT DISTINCT year, month FROM budgets ORDER BY year DESC, month DESC');
}

export async function getBudgetOverview(db: Database, value: BudgetMonth): Promise<BudgetOverview> {
  const bounds = monthBounds(value);
  const [overall, categories, totalRow, spendRows] = await Promise.all([
    getMonthlyBudget(db, value), getCategoryBudgets(db, value),
    db.getFirstAsync<{ spent_paise: number }>(`SELECT COALESCE(SUM(amount_paise), 0) AS spent_paise FROM transactions
      WHERE type = 'expense' AND transaction_date >= ? AND transaction_date < ?`, bounds.start, bounds.end),
    db.getAllAsync<SpendRow>(`SELECT category_id, SUM(amount_paise) AS spent_paise FROM transactions
      WHERE type = 'expense' AND transaction_date >= ? AND transaction_date < ? GROUP BY category_id`, bounds.start, bounds.end),
  ]);
  const spentPaise = totalRow?.spent_paise ?? 0;
  if (!Number.isSafeInteger(spentPaise) || spentPaise < 0) throw new Error('Budget spending total is too large');
  const byCategory = new Map(spendRows.map((row) => [row.category_id, row.spent_paise]));
  const usage = (budget: Budget, spent: number): BudgetUsage => {
    const result = calculateBudgetUsage(budget.amountPaise, spent);
    return { ...budget, spentPaise: spent, ...result };
  };
  return { month: value, spentPaise, overall: overall ? usage(overall, spentPaise) : null,
    categories: categories.map((budget) => usage(budget, byCategory.get(budget.categoryId!) ?? 0)) };
}

/** Claims each reached threshold once in SQLite; only the highest newly reached threshold is surfaced. */
export async function evaluateBudgetAlerts(db: Database, value: BudgetMonth, now = Date.now()): Promise<BudgetAlert[]> {
  const overview = await getBudgetOverview(db, value);
  const alerts: BudgetAlert[] = [];
  for (const budget of [overview.overall, ...overview.categories]) {
    if (!budget) continue;
    if (budget.status === 'On Track') continue;
    const near = await db.runAsync('INSERT OR IGNORE INTO budget_alert_history (budget_id, threshold, triggered_at) VALUES (?, 80, ?)', budget.id, now);
    if (budget.status === 'Near Limit') {
      if (near.changes === 1) alerts.push({ budget, threshold: 80 });
      continue;
    }
    const reached = await db.runAsync('INSERT OR IGNORE INTO budget_alert_history (budget_id, threshold, triggered_at) VALUES (?, 100, ?)', budget.id, now);
    if (reached.changes === 1) alerts.push({ budget, threshold: 100 });
  }
  return alerts;
}
