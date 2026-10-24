import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowDownUp, ListFilter, ReceiptText, Search, X } from 'lucide-react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddButton } from '@/components/add-button';
import { EmptyState } from '@/components/empty-state';
import { TransactionCard } from '@/components/transaction-card';
import { TransactionFilterSheet } from '@/components/transaction-filter-sheet';
import { useTransactionEvents } from '@/data/transaction-events';
import { getAllTransactions, getCategories } from '@/data/transactions';
import type { Category, TransactionRecord, TransactionType } from '@/data/types';
import { formatDate } from '@/domain/dates';
import { formatPaise } from '@/domain/money';
import { localDateStart } from '@/domain/heatmap';
import { applyTransactionFilters, defaultTransactionFilters, summarizeTransactions, type SortOption, type TransactionFilters } from '@/domain/transaction-filters';
import { colors } from '@/theme/palette';

const sorts: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest First' }, { value: 'oldest', label: 'Oldest First' },
  { value: 'amount_asc', label: 'Amount: Low to High' }, { value: 'amount_desc', label: 'Amount: High to Low' },
  { value: 'title_asc', label: 'Title: A to Z' }, { value: 'title_desc', label: 'Title: Z to A' },
];
const dateLabels = { all: 'All Time', today: 'Today', yesterday: 'Yesterday', last7: 'Last 7 Days', thisMonth: 'This Month', lastMonth: 'Last Month', custom: 'Custom Range' };

export default function TransactionsScreen() {
  const { spendingDate, filterToken } = useLocalSearchParams<{ spendingDate?: string; filterToken?: string }>();
  const db = useSQLiteContext();
  const { revision } = useTransactionEvents();
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filters, setFilters] = useState<TransactionFilters>(defaultTransactionFilters);
  const [searchInput, setSearchInput] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof spendingDate !== 'string') return;
    const start = localDateStart(spendingDate);
    if (start === null) return;
    const timer = setTimeout(() => {
      setFilters({ ...defaultTransactionFilters(), type: 'expense', datePreset: 'custom', customStartDate: start, customEndDate: start });
      setSearchInput('');
    }, 0);
    return () => clearTimeout(timer);
  }, [spendingDate, filterToken]);

  useFocusEffect(useCallback(() => {
    let active = true;
    Promise.all([getAllTransactions(db), getCategories(db, 'income'), getCategories(db, 'expense')])
      .then(([rows, income, expense]) => { if (active) { setTransactions(rows); setCategories([...income, ...expense]); setLoading(false); setError(null); } })
      .catch(() => { if (active) { setLoading(false); setError('Could not load transactions. Return to this tab to retry.'); } });
    return () => { active = false; };
    // A write increments revision, so refresh even if this tab never lost focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, revision]));

  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => current.search === searchInput ? current : { ...current, search: searchInput }), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const filtered = useMemo(() => applyTransactionFilters(transactions, filters), [transactions, filters]);
  const totals = useMemo(() => summarizeTransactions(filtered), [filtered]);
  const setType = (type: TransactionType | 'all') => setFilters((current) => ({ ...current, type, categories: current.categories.filter((id) => categories.some((category) => category.id === id && (type === 'all' || category.type === type))) }));
  const applyFilters = (next: TransactionFilters) => { setFilters(next); setSearchInput(next.search); };
  const reset = () => applyFilters(defaultTransactionFilters());
  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (filters.search.trim()) chips.push({ key: 'search', label: `Search: ${filters.search.trim()}`, remove: () => { setSearchInput(''); setFilters((current) => ({ ...current, search: '' })); } });
  if (filters.type !== 'all') chips.push({ key: 'type', label: filters.type === 'income' ? 'Income' : 'Expense', remove: () => setType('all') });
  if (filters.minAmountPaise > 0) chips.push({ key: 'minimum', label: `At least ${formatPaise(filters.minAmountPaise)}`, remove: () => setFilters((current) => ({ ...current, minAmountPaise: 0 })) });
  if (filters.maxAmountPaise !== null) chips.push({ key: 'maximum', label: `Up to ${formatPaise(filters.maxAmountPaise)}`, remove: () => setFilters((current) => ({ ...current, maxAmountPaise: null })) });
  filters.categories.forEach((id) => chips.push({ key: `category-${id}`, label: categories.find((category) => category.id === id)?.name ?? 'Category', remove: () => setFilters((current) => ({ ...current, categories: current.categories.filter((value) => value !== id) })) }));
  filters.paymentMethods.forEach((method) => chips.push({ key: `method-${method}`, label: method, remove: () => setFilters((current) => ({ ...current, paymentMethods: current.paymentMethods.filter((value) => value !== method) })) }));
  if (filters.datePreset !== 'all') chips.push({ key: 'date', label: filters.datePreset === 'custom' && filters.customStartDate !== null && filters.customStartDate === filters.customEndDate ? `Date: ${formatDate(filters.customStartDate)}` : dateLabels[filters.datePreset], remove: () => setFilters((current) => ({ ...current, datePreset: 'all', customStartDate: null, customEndDate: null })) });
  if (filters.sortBy !== 'newest') chips.push({ key: 'sort', label: sorts.find((option) => option.value === filters.sortBy)?.label ?? 'Sort', remove: () => setFilters((current) => ({ ...current, sortBy: 'newest' })) });

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <FlatList data={filtered} keyExtractor={(item) => item.id}
      renderItem={({ item }) => <TransactionCard transaction={item} onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: item.id } })} />}
      contentContainerStyle={styles.list} ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListHeaderComponent={<View style={styles.header}>
        <View style={styles.titleRow}><View><Text style={styles.heading}>Transactions</Text><Text style={styles.subtitle}>Every rupee, accounted for</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Open filters" onPress={() => setSheetOpen(true)} style={styles.headingAction}><ListFilter color={colors.primary} size={22} /></Pressable></View>
        <View style={styles.searchBox}><Search color={colors.secondaryText} size={20} /><TextInput style={styles.searchInput} value={searchInput} onChangeText={setSearchInput}
          placeholder="Search title, notes or category" placeholderTextColor={colors.placeholder} accessibilityLabel="Search transactions" returnKeyType="search" />
          {searchInput !== '' && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => { setSearchInput(''); setFilters((current) => ({ ...current, search: '' })); }}><X color={colors.secondaryText} size={20} /></Pressable>}</View>
        <View style={styles.segment}>{(['all', 'income', 'expense'] as const).map((type) => <Pressable key={type} accessibilityRole="button" accessibilityState={{ selected: filters.type === type }} onPress={() => setType(type)} style={[styles.segmentItem, filters.type === type && styles.segmentSelected]}><Text style={[styles.segmentText, filters.type === type && styles.segmentSelectedText]}>{type.toUpperCase()}</Text></Pressable>)}</View>
        <View style={styles.toolbar}><Pressable style={styles.toolButton} onPress={() => setSheetOpen(true)} accessibilityRole="button"><ListFilter color={colors.primary} size={17} /><Text style={styles.toolText}>Filters{chips.length ? ` (${chips.length})` : ''}</Text></Pressable>
          <Pressable style={styles.toolButton} onPress={() => setSortOpen(true)} accessibilityRole="button"><ArrowDownUp color={colors.primary} size={17} /><Text style={styles.toolText}>{sorts.find((option) => option.value === filters.sortBy)?.label}</Text></Pressable></View>
        {chips.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeChips}>{chips.map((chip) => <Pressable key={chip.key} accessibilityRole="button" accessibilityLabel={`Remove ${chip.label} filter`} onPress={chip.remove} style={styles.activeChip}><Text style={styles.activeChipText}>{chip.label}</Text><X color={colors.primary} size={14} /></Pressable>)}</ScrollView>}
        <View style={styles.summary}><Text style={styles.count}>{totals.count} {totals.count === 1 ? 'Transaction' : 'Transactions'} Found</Text><View style={styles.summaryRow}><Text style={styles.summaryLabel}>Income</Text><Text style={[styles.summaryValue, { color: colors.income }]}>{formatPaise(totals.incomePaise)}</Text></View><View style={styles.summaryRow}><Text style={styles.summaryLabel}>Expenses</Text><Text style={[styles.summaryValue, { color: colors.expense }]}>{formatPaise(totals.expensePaise)}</Text></View><View style={styles.summaryRow}><Text style={styles.summaryLabel}>Net cash flow</Text><Text style={styles.summaryValue}>{totals.netPaise >= 0 ? '+' : ''}{formatPaise(totals.netPaise)}</Text></View></View>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </View>}
      ListEmptyComponent={loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : transactions.length === 0
        ? <EmptyState icon={<ReceiptText color={colors.primary} size={32} />} title="No transactions yet" description="Add your first income or expense to get started." />
        : <View><EmptyState icon={<Search color={colors.primary} size={32} />} title={filters.search.trim() ? 'No transactions match your search' : 'No transactions match the selected filters'} description="Try a different search or adjust your filters." /><Pressable style={styles.resetEmpty} accessibilityRole="button" onPress={reset}><Text style={styles.resetEmptyText}>Reset Filters</Text></Pressable></View>} />
    <View style={styles.action}><AddButton /></View>
    {sheetOpen && <TransactionFilterSheet visible={sheetOpen} applied={{ ...filters, search: searchInput }} transactions={transactions} categories={categories} onClose={() => setSheetOpen(false)} onApply={applyFilters} />}
    <Modal visible={sortOpen} transparent animationType="fade" onRequestClose={() => setSortOpen(false)}><Pressable style={styles.sortOverlay} onPress={() => setSortOpen(false)}><View style={styles.sortPanel}><Text style={styles.sortHeading}>Sort transactions</Text>{sorts.map((option) => <Pressable key={option.value} onPress={() => { setFilters((current) => ({ ...current, sortBy: option.value })); setSortOpen(false); }} style={styles.sortOption} accessibilityRole="button" accessibilityState={{ selected: filters.sortBy === option.value }}><Text style={[styles.sortText, filters.sortBy === option.value && styles.sortActive]}>{option.label}</Text>{filters.sortBy === option.value && <Text style={styles.sortActive}>✓</Text>}</Pressable>)}</View></Pressable></Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, list: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 106, flexGrow: 1 },
  header: { marginBottom: 18 }, titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heading: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.7 }, subtitle: { color: colors.secondaryText, fontSize: 14, marginTop: 7 },
  headingAction: { backgroundColor: colors.surface, padding: 12, borderRadius: 14 },
  searchBox: { backgroundColor: colors.surface, borderRadius: 15, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, marginTop: 23, minHeight: 52, gap: 10 },
  searchInput: { flex: 1, color: colors.text, fontSize: 14 }, segment: { backgroundColor: colors.surface, borderRadius: 14, padding: 4, flexDirection: 'row', marginTop: 13 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 11 }, segmentSelected: { backgroundColor: colors.primary },
  segmentText: { color: colors.secondaryText, fontSize: 12, fontWeight: '700' }, segmentSelectedText: { color: colors.background },
  toolbar: { flexDirection: 'row', gap: 10, marginTop: 15 }, toolButton: { backgroundColor: colors.surface, borderRadius: 12, minHeight: 40, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7, maxWidth: '65%' }, toolText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  activeChips: { gap: 8, paddingTop: 15, paddingBottom: 3 }, activeChip: { backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 6 }, activeChipText: { color: colors.text, fontSize: 12 },
  summary: { backgroundColor: colors.surface, borderRadius: 18, marginTop: 18, padding: 17, gap: 9 }, count: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 3 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, summaryLabel: { color: colors.secondaryText, fontSize: 13 }, summaryValue: { color: colors.text, fontSize: 13, fontWeight: '700' },
  error: { color: colors.expense, fontSize: 13, marginTop: 12 }, loader: { marginTop: 30 }, separator: { height: 9 },
  resetEmpty: { backgroundColor: colors.primary, borderRadius: 13, padding: 14, alignItems: 'center', marginTop: 12 }, resetEmptyText: { color: colors.background, fontWeight: '700' },
  action: { position: 'absolute', right: 22, bottom: 20 }, sortOverlay: { flex: 1, backgroundColor: '#0A0F1ECC', justifyContent: 'center', paddingHorizontal: 24 },
  sortPanel: { backgroundColor: colors.surface, borderRadius: 22, padding: 20 }, sortHeading: { color: colors.text, fontSize: 19, fontWeight: '800', marginBottom: 10 }, sortOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sortText: { color: colors.text, fontSize: 14 }, sortActive: { color: colors.primary, fontWeight: '800' },
});
