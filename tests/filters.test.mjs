import assert from 'node:assert/strict';
import test from 'node:test';

import { formatPaise } from '../src/domain/money.ts';
import { amountSliderScale, applyTransactionFilters, defaultTransactionFilters, parseFilterAmountPaise, resolveDateRange, sliderRangeToFilters, summarizeTransactions, validateTransactionFilters } from '../src/domain/transaction-filters.ts';

const at = (day, hour = 12) => new Date(2026, 9, day, hour).getTime();
const row = (id, overrides = {}) => ({
  id, type: 'expense', amountPaise: 20000, title: 'Lunch', categoryId: 'expense-food',
  categoryName: 'Food & Drinks', categoryIcon: 'food', paymentMethod: 'UPI', notes: null,
  transactionDate: at(21), createdAt: at(21), updatedAt: at(21), ...overrides,
});
const rows = [
  row('a', { amountPaise: 20000, title: 'Lunch', notes: 'Team MEAL' }),
  row('b', { type: 'income', amountPaise: 100000, title: 'Salary', categoryId: 'income-salary', categoryName: 'Salary', paymentMethod: 'Bank Transfer', transactionDate: at(19) }),
  row('c', { amountPaise: 50000, title: 'Taxi', categoryId: 'expense-transport', categoryName: 'Transport', paymentMethod: 'Cash', transactionDate: at(20) }),
  row('d', { amountPaise: 200000, title: 'Rent', categoryId: 'expense-rent', categoryName: 'Rent', paymentMethod: 'UPI', transactionDate: at(1) }),
];
const filter = (patch = {}, input = rows) => applyTransactionFilters(input, { ...defaultTransactionFilters(), ...patch }, at(22));
const ids = (input) => input.map((item) => item.id);

test('income and expense controls', () => {
  assert.deepEqual(ids(filter({ type: 'income' })), ['b']);
  assert.deepEqual(ids(filter({ type: 'expense' })), ['a', 'c', 'd']);
});
test('searches title, notes and category without case sensitivity', () => {
  assert.deepEqual(ids(filter({ search: 'salARY' })), ['b']);
  assert.deepEqual(ids(filter({ search: 'team meal' })), ['a']);
  assert.deepEqual(ids(filter({ search: 'TRANSPORT' })), ['c']);
});
test('minimum, maximum and combined amount boundaries are inclusive', () => {
  assert.deepEqual(ids(filter({ minAmountPaise: 50000 })), ['c', 'b', 'd']);
  assert.deepEqual(ids(filter({ maxAmountPaise: 50000 })), ['a', 'c']);
  assert.deepEqual(ids(filter({ minAmountPaise: 20000, maxAmountPaise: 50000 })), ['a', 'c']);
});
test('multiple categories and payment methods', () => {
  assert.deepEqual(ids(filter({ categories: ['expense-food', 'expense-rent'] })), ['a', 'd']);
  assert.deepEqual(ids(filter({ paymentMethods: ['Cash', 'Bank Transfer'] })), ['c', 'b']);
});
test('date presets use local day boundaries', () => {
  assert.deepEqual(ids(filter({ datePreset: 'today' })), []);
  assert.deepEqual(ids(filter({ datePreset: 'yesterday' })), ['a']);
  assert.deepEqual(ids(filter({ datePreset: 'last7' })), ['a', 'c', 'b']);
  assert.deepEqual(ids(filter({ datePreset: 'thisMonth' })), ['a', 'c', 'b', 'd']);
  assert.deepEqual(ids(filter({ datePreset: 'lastMonth' })), []);
});
test('custom date range includes its full end date', () => {
  const start = at(19, 0);
  const end = at(20, 0);
  assert.deepEqual(ids(filter({ datePreset: 'custom', customStartDate: start, customEndDate: end })), ['c', 'b']);
  const range = resolveDateRange({ ...defaultTransactionFilters(), datePreset: 'custom', customStartDate: start, customEndDate: end });
  assert.equal(range.end, at(21, 0));
});
test('sorts by numeric paise, transaction date and title', () => {
  assert.deepEqual(ids(filter({ sortBy: 'amount_asc' })), ['a', 'c', 'b', 'd']);
  assert.deepEqual(ids(filter({ sortBy: 'amount_desc' })), ['d', 'b', 'c', 'a']);
  assert.deepEqual(ids(filter({ sortBy: 'newest' })), ['a', 'c', 'b', 'd']);
  assert.deepEqual(ids(filter({ sortBy: 'oldest' })), ['d', 'b', 'c', 'a']);
  assert.deepEqual(ids(filter({ sortBy: 'title_asc' })), ['a', 'd', 'b', 'c']);
  assert.deepEqual(ids(filter({ sortBy: 'title_desc' })), ['c', 'b', 'd', 'a']);
});
test('same-date ordering has consistent created-at and id tie breaks', () => {
  const same = [row('b'), row('a'), row('c', { createdAt: at(21, 13) })];
  assert.deepEqual(ids(filter({}, same)), ['c', 'b', 'a']);
  assert.deepEqual(ids(filter({ sortBy: 'oldest' }, same)), ['a', 'b', 'c']);
});
test('all filters combine, leave source unchanged and update after edits or deletion', () => {
  const criteria = { type: 'expense', search: 'lunch', minAmountPaise: 20000, maxAmountPaise: 30000,
    categories: ['expense-food'], paymentMethods: ['UPI'], datePreset: 'thisMonth', sortBy: 'amount_desc' };
  const before = [...rows];
  assert.deepEqual(ids(filter(criteria)), ['a']);
  assert.deepEqual(rows, before);
  assert.deepEqual(ids(filter(criteria, rows.map((item) => item.id === 'a' ? { ...item, amountPaise: 35000 } : item))), []);
  assert.deepEqual(ids(filter(criteria, rows.filter((item) => item.id !== 'a'))), []);
});
test('reset defaults and empty transaction list', () => {
  assert.deepEqual(ids(filter(defaultTransactionFilters())), ['a', 'c', 'b', 'd']);
  assert.deepEqual(filter({}, []), []);
  assert.deepEqual(summarizeTransactions([]), { count: 0, incomePaise: 0, expensePaise: 0, netPaise: 0 });
});
test('filtered totals stay in integer paise and format decimals', () => {
  const matching = filter({ maxAmountPaise: 100000 });
  assert.deepEqual(summarizeTransactions(matching), { count: 3, incomePaise: 100000, expensePaise: 70000, netPaise: 30000 });
  assert.equal(formatPaise(20050), '₹200.50');
});
test('validates invalid ranges and maintains a safe slider range', () => {
  assert.match(validateTransactionFilters({ ...defaultTransactionFilters(), minAmountPaise: 201, maxAmountPaise: 200 }), /Maximum/);
  assert.match(validateTransactionFilters({ ...defaultTransactionFilters(), datePreset: 'custom', customStartDate: at(21), customEndDate: at(20) }), /Start date/);
  assert.equal(amountSliderScale([]).maximumPaise, 10000);
  assert.ok(amountSliderScale(rows).maximumPaise >= 200000);
  assert.ok(amountSliderScale([row('large', { amountPaise: 987654321 })]).maximumPaise >= 987654321);
});

test('range amount parser accepts exact paise and zero but rejects malformed values', () => {
  assert.equal(parseFilterAmountPaise('0'), 0);
  assert.equal(parseFilterAmountPaise('1,234.56'), 123456);
  assert.equal(parseFilterAmountPaise('500.5'), 50050);
  assert.equal(parseFilterAmountPaise('500.005'), null);
  assert.equal(parseFilterAmountPaise('1,2'), null);
  assert.equal(parseFilterAmountPaise('-1'), null);
  assert.equal(parseFilterAmountPaise(''), null);
  assert.equal(parseFilterAmountPaise('999999999999999999999'), null);
});

test('slider bounds round up and expand for a valid typed amount', () => {
  assert.equal(amountSliderScale([row('highest', { amountPaise: 845000 })]).maximumPaise, 1000000);
  assert.equal(amountSliderScale([], 1500000).maximumPaise, 2000000);
  assert.equal(amountSliderScale([]).maximumPaise, 10000);
  assert.equal(amountSliderScale([row('huge', { amountPaise: Number.MAX_SAFE_INTEGER })]).maximumPaise, Number.MAX_SAFE_INTEGER);
});

test('two thumbs preserve inclusive endpoints and may meet without crossing', () => {
  assert.deepEqual(sliderRangeToFilters(20050, 100000, 1000000), { minAmountPaise: 20050, maxAmountPaise: 100000 });
  assert.deepEqual(sliderRangeToFilters(50000, 50000, 1000000), { minAmountPaise: 50000, maxAmountPaise: 50000 });
  assert.throws(() => sliderRangeToFilters(50001, 50000, 1000000), /Invalid/);
  assert.deepEqual(ids(filter(sliderRangeToFilters(50000, 50000, 1000000))), ['c']);
});

test('full range and reset range use no amount restrictions', () => {
  assert.deepEqual(sliderRangeToFilters(0, 1000000, 1000000), { minAmountPaise: 0, maxAmountPaise: null });
  assert.deepEqual(ids(filter(sliderRangeToFilters(0, 1000000, 1000000))), ['a', 'c', 'b', 'd']);
  const narrowed = { ...defaultTransactionFilters(), ...sliderRangeToFilters(50000, 100000, 1000000), search: 'taxi' };
  assert.deepEqual(ids(applyTransactionFilters(rows, narrowed, at(22))), ['c']);
  assert.deepEqual(ids(applyTransactionFilters(rows, { ...narrowed, minAmountPaise: 0, maxAmountPaise: null }, at(22))), ['c']);
});
