import type { PaymentMethod, TransactionRecord, TransactionType } from '../data/types.ts';

export type SortOption = 'newest' | 'oldest' | 'amount_asc' | 'amount_desc' | 'title_asc' | 'title_desc';
export type DatePreset = 'all' | 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth' | 'custom';

export type TransactionFilters = {
  search: string;
  type: TransactionType | 'all';
  minAmountPaise: number;
  maxAmountPaise: number | null;
  categories: string[];
  paymentMethods: PaymentMethod[];
  datePreset: DatePreset;
  customStartDate: number | null;
  customEndDate: number | null;
  sortBy: SortOption;
};

export function defaultTransactionFilters(): TransactionFilters {
  return { search: '', type: 'all', minAmountPaise: 0, maxAmountPaise: null,
    categories: [], paymentMethods: [], datePreset: 'all', customStartDate: null,
    customEndDate: null, sortBy: 'newest' };
}

function dayStart(value: number): number {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function nextDay(value: number): number {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
}

export function resolveDateRange(filters: TransactionFilters, now = Date.now()): { start: number | null; end: number | null } {
  const today = dayStart(now);
  const date = new Date(now);
  switch (filters.datePreset) {
    case 'today': return { start: today, end: nextDay(today) };
    case 'yesterday': {
      const yesterday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1).getTime();
      return { start: yesterday, end: today };
    }
    case 'last7': return { start: new Date(date.getFullYear(), date.getMonth(), date.getDate() - 6).getTime(), end: nextDay(today) };
    case 'thisMonth': return { start: new Date(date.getFullYear(), date.getMonth(), 1).getTime(), end: new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime() };
    case 'lastMonth': return { start: new Date(date.getFullYear(), date.getMonth() - 1, 1).getTime(), end: new Date(date.getFullYear(), date.getMonth(), 1).getTime() };
    case 'custom': return { start: filters.customStartDate === null ? null : dayStart(filters.customStartDate), end: filters.customEndDate === null ? null : nextDay(filters.customEndDate) };
    default: return { start: null, end: null };
  }
}

export function validateTransactionFilters(filters: TransactionFilters): string | null {
  if (!Number.isSafeInteger(filters.minAmountPaise) || filters.minAmountPaise < 0) return 'Choose a valid minimum amount.';
  if (filters.maxAmountPaise !== null && (!Number.isSafeInteger(filters.maxAmountPaise) || filters.maxAmountPaise < filters.minAmountPaise)) return 'Maximum amount must be at least the minimum amount.';
  if (filters.datePreset === 'custom' && filters.customStartDate !== null && filters.customEndDate !== null && dayStart(filters.customStartDate) > dayStart(filters.customEndDate)) return 'Start date must be on or before end date.';
  return null;
}

export function applyTransactionFilters(transactions: readonly TransactionRecord[], filters: TransactionFilters, now = Date.now()): TransactionRecord[] {
  const query = filters.search.trim().toLocaleLowerCase();
  const { start, end } = resolveDateRange(filters, now);
  const categories = new Set(filters.categories);
  const methods = new Set(filters.paymentMethods);
  const result = transactions.filter((transaction) =>
    (filters.type === 'all' || transaction.type === filters.type) &&
    (query === '' || [transaction.title, transaction.notes ?? '', transaction.categoryName].some((field) => field.toLocaleLowerCase().includes(query))) &&
    transaction.amountPaise >= filters.minAmountPaise &&
    (filters.maxAmountPaise === null || transaction.amountPaise <= filters.maxAmountPaise) &&
    (categories.size === 0 || categories.has(transaction.categoryId)) &&
    (methods.size === 0 || methods.has(transaction.paymentMethod)) &&
    (start === null || transaction.transactionDate >= start) &&
    (end === null || transaction.transactionDate < end)
  );
  const chronological = (a: TransactionRecord, b: TransactionRecord) => a.transactionDate - b.transactionDate || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
  result.sort((a, b) => {
    switch (filters.sortBy) {
      case 'oldest': return chronological(a, b);
      case 'amount_asc': return a.amountPaise - b.amountPaise || -chronological(a, b);
      case 'amount_desc': return b.amountPaise - a.amountPaise || -chronological(a, b);
      case 'title_asc': return a.title.localeCompare(b.title) || -chronological(a, b);
      case 'title_desc': return b.title.localeCompare(a.title) || -chronological(a, b);
      default: return -chronological(a, b);
    }
  });
  return result;
}

export function summarizeTransactions(transactions: readonly TransactionRecord[]) {
  let incomePaise = 0;
  let expensePaise = 0;
  for (const transaction of transactions) {
    if (transaction.type === 'income') incomePaise += transaction.amountPaise;
    else expensePaise += transaction.amountPaise;
  }
  const netPaise = incomePaise - expensePaise;
  if (![incomePaise, expensePaise, netPaise].every(Number.isSafeInteger)) throw new Error('Filtered total is too large');
  return { count: transactions.length, incomePaise, expensePaise, netPaise };
}

export function amountSliderScale(transactions: readonly TransactionRecord[], requiredPaise = 0) {
  const maximum = transactions.reduce((value, item) => Math.max(value, item.amountPaise), requiredPaise);
  const rupees = Math.max(100, maximum / 100);
  const magnitude = 10 ** Math.floor(Math.log10(rupees));
  const ratio = rupees / magnitude;
  const multiplier = ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10;
  const upperRupees = multiplier * magnitude;
  return { maximumPaise: Math.min(Number.MAX_SAFE_INTEGER, upperRupees * 100) };
}

export function parseFilterAmountPaise(raw: string): number | null {
  const value = raw.trim().replace(/,/g, '');
  if (!/^(?:\d+|\d{1,3}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(raw.trim())) return null;
  const [whole, fraction = ''] = value.split('.');
  const rupees = Number(whole);
  if (!Number.isSafeInteger(rupees) || rupees > Math.floor(Number.MAX_SAFE_INTEGER / 100)) return null;
  const paise = rupees * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(paise) ? paise : null;
}

export function sliderRangeToFilters(minimum: number, maximum: number, sliderMaximum: number): Pick<TransactionFilters, 'minAmountPaise' | 'maxAmountPaise'> {
  const min = Math.round(minimum);
  const max = Math.round(maximum);
  if (![min, max, sliderMaximum].every(Number.isSafeInteger) || min < 0 || max < min || max > sliderMaximum) {
    throw new Error('Invalid amount range');
  }
  return { minAmountPaise: min, maxAmountPaise: max === sliderMaximum ? null : max };
}
