import type { TransactionRecord } from '../data/types.ts';
import { applyTransactionFilters, type TransactionFilters } from './transaction-filters.ts';

function safeCell(value: string): string {
  // Excel and Sheets may execute formulas after trimming leading whitespace.
  const protectedValue = /^[\s\uFEFF]*[=+\-@]/.test(value) || /^[\t\r]/.test(value) ? `'${value}` : value;
  return `"${protectedValue.replace(/"/g, '""')}"`;
}

function amountInr(paise: number): string {
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
}

export function transactionsToCsv(transactions: readonly TransactionRecord[], filters: TransactionFilters, now = Date.now()): string {
  const rows = applyTransactionFilters(transactions, filters, now);
  const header = ['Transaction ID', 'Date', 'Time', 'Type', 'Title', 'Category', 'Amount in INR', 'Payment Method', 'Notes'];
  const lines = rows.map((item) => {
    const date = new Date(item.transactionDate);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
    return [item.id, day, time, item.type, item.title, item.categoryName, amountInr(item.amountPaise), item.paymentMethod, item.notes ?? ''].map(safeCell).join(',');
  });
  return `\uFEFF${[header.map(safeCell).join(','), ...lines].join('\r\n')}\r\n`;
}
