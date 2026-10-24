import type { SQLiteDatabase } from 'expo-sqlite';

import { getHeatmapData, heatmapBounds, localDateStart, type DailySpending, type HeatmapPeriod } from '../domain/heatmap.ts';

type Database = Pick<SQLiteDatabase, 'getAllAsync'>;
type DailyRow = { date: string; amount_paise: number; count: number };

export async function getDailySpendingTotals(db: Database, start: number, end: number): Promise<DailySpending[]> {
  const rows = await db.getAllAsync<DailyRow>(`SELECT strftime('%Y-%m-%d', transaction_date / 1000, 'unixepoch', 'localtime') AS date,
    SUM(amount_paise) AS amount_paise, COUNT(*) AS count FROM transactions
    WHERE type = 'expense' AND transaction_date >= ? AND transaction_date < ? GROUP BY date ORDER BY date`, start, end);
  return rows.map((row) => {
    if (!Number.isSafeInteger(row.amount_paise) || row.amount_paise < 0) throw new Error('Daily spending total is too large');
    return { date: row.date, amountPaise: row.amount_paise, count: row.count };
  });
}

export async function getSpendingHeatmap(db: Database, period: HeatmapPeriod, now = Date.now()) {
  const bounds = heatmapBounds(period, now);
  return getHeatmapData(bounds, await getDailySpendingTotals(db, bounds.start, bounds.end));
}

export async function getSpendingForDate(db: Database, key: string) {
  const start = localDateStart(key);
  if (start === null) throw new Error('Invalid spending date');
  const date = new Date(start);
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
  const rows = await db.getAllAsync<{ category_name: string; amount_paise: number; count: number }>(`
    SELECT c.name AS category_name, SUM(t.amount_paise) AS amount_paise, COUNT(*) AS count
    FROM transactions t JOIN categories c ON c.id = t.category_id
    WHERE t.type = 'expense' AND t.transaction_date >= ? AND t.transaction_date < ?
    GROUP BY c.id, c.name ORDER BY amount_paise DESC`, start, end);
  const largest = await db.getAllAsync<{ category_name: string; amount_paise: number }>(`
    SELECT c.name AS category_name, t.amount_paise FROM transactions t JOIN categories c ON c.id = t.category_id
    WHERE t.type = 'expense' AND t.transaction_date >= ? AND t.transaction_date < ?
    ORDER BY t.amount_paise DESC, t.id DESC LIMIT 1`, start, end);
  const amountPaise = rows.reduce((sum, row) => sum + row.amount_paise, 0);
  if (!Number.isSafeInteger(amountPaise)) throw new Error('Daily spending total is too large');
  return { date: key, amountPaise, count: rows.reduce((sum, row) => sum + row.count, 0),
    highest: largest[0] ? { category: largest[0].category_name, amountPaise: largest[0].amount_paise } : null,
    categories: rows.map((row) => ({ name: row.category_name, amountPaise: row.amount_paise, count: row.count })) };
}
