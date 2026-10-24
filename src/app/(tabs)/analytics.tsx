import { router, useIsFocused } from 'expo-router';
import { ChartNoAxesCombined } from 'lucide-react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';

import { EmptyState } from '@/components/empty-state';
import { AnalyticsBudgetComparison } from '@/components/analytics-budget-comparison';
import { PeriodSelector } from '@/components/period-selector';
import { Screen } from '@/components/screen';
import { SpendingHeatmap } from '@/components/spending-heatmap';
import { getMonthlyComparison, getPeriodAnalytics, getSpendingTrend } from '@/data/analytics';
import { RequestCache } from '@/data/request-cache';
import { useTransactionEvents } from '@/data/transaction-events';
import { averageDailyPaise, mostFrequentCategory, percentOf, spendingChange, type ReportingPeriod, type TrendPeriod } from '@/domain/analytics';
import { formatDate } from '@/domain/dates';
import { formatPaise } from '@/domain/money';
import { colors } from '@/theme/palette';

const categoryChartColors = ['#3B82F6', '#60A5FA', '#A78BFA', '#F59E0B', '#06B6D4', '#C084FC', '#F472B6', '#EAB308', '#94A3B8'];
const trendOptions: { value: TrendPeriod; label: string }[] = [
  { value: '7d', label: '7 Days' }, { value: '30d', label: '30 Days' },
  { value: '6m', label: '6 Months' }, { value: '12m', label: '12 Months' },
];
type PeriodData = Awaited<ReturnType<typeof getPeriodAnalytics>>;
type TrendData = Awaited<ReturnType<typeof getSpendingTrend>>;
type MonthlyData = Awaited<ReturnType<typeof getMonthlyComparison>>;
type AnalyticsBundle = { period: ReportingPeriod; trendPeriod: TrendPeriod; scopeKey: string; data: PeriodData; trend: TrendData; monthly: MonthlyData };

function axisRupees(raw: string) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return raw;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}k`;
  return `₹${Math.round(value)}`;
}

export default function AnalyticsScreen() {
  const db = useSQLiteContext();
  const { revision } = useTransactionEvents();
  const isFocused = useIsFocused();
  const [period, setPeriod] = useState<ReportingPeriod>('month');
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('7d');
  const [lastValid, setLastValid] = useState<AnalyticsBundle | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedBar, setSelectedBar] = useState<string | null>(null);
  const [selectedTrend, setSelectedTrend] = useState<string | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [comparisonWidth, setComparisonWidth] = useState(0);
  const [trendWidth, setTrendWidth] = useState(0);
  // A new day changes the date bounds even when the transaction revision is unchanged.
  const day = new Date().toDateString();
  const caches = useMemo(() => ({
    // Scope cached results to the database, transaction revision, and local day.
    scope: { db, revision, day },
    periods: new RequestCache<ReportingPeriod, PeriodData>(),
    trends: new RequestCache<TrendPeriod, TrendData>(),
    monthly: new RequestCache<'monthly', MonthlyData>(),
    bundles: new RequestCache<string, AnalyticsBundle>(),
  }), [db, revision, day]);
  const wasFocused = useRef(false);
  const selectionKey = `${revision}:${day}:${period}:${trendPeriod}`;
  const scopeKey = `${revision}:${day}`;
  const bundleKey = `${period}:${trendPeriod}`;
  const visible = caches.bundles.getCached(bundleKey) ?? (lastValid?.scopeKey === scopeKey ? lastValid : null);
  const data = visible?.data;
  const trend = visible?.trend;
  const monthly = visible?.monthly;

  useEffect(() => {
    if (!isFocused) { wasFocused.current = false; return; }
    const refresh = !wasFocused.current;
    wasFocused.current = true;
    let active = true;
    caches.bundles.get(bundleKey, async () => {
      const [periodData, trendData, monthlyData] = await Promise.all([
        caches.periods.get(period, () => getPeriodAnalytics(db, period), refresh),
        caches.trends.get(trendPeriod, () => getSpendingTrend(db, trendPeriod), refresh),
        caches.monthly.get('monthly', () => getMonthlyComparison(db), refresh),
      ]);
      return { period, trendPeriod, scopeKey, data: periodData, trend: trendData, monthly: monthlyData };
    }, refresh).then((bundle) => {
      if (!active) return;
      setLastValid(bundle);
      setError(null);
    }).catch(() => {
      if (active) setError({ key: selectionKey, message: 'Could not load analytics. Return to this tab to retry.' });
    });
    return () => { active = false; };
  }, [isFocused, db, caches, period, trendPeriod, bundleKey, selectionKey, scopeKey]);

  const selectedCategory = data?.categories.find((category) => category.id === selectedCategoryId) ?? data?.categories[0];
  const pending = !visible && error?.key !== selectionKey;
  const topCategory = data?.categories[0];
  const mostFrequent = mostFrequentCategory(data?.categories ?? []);
  const largest = data?.largestExpenses[0];
  const change = monthly ? spendingChange(monthly.current.expensePaise, monthly.previous.expensePaise) : null;
  const comparison = data?.comparisonBuckets ?? [];
  const comparisonHasValues = comparison.some((item) => item.incomePaise > 0 || item.expensePaise > 0);
  const barData = comparison.flatMap((bucket) => [
    { value: bucket.incomePaise / 100, frontColor: colors.income, label: '', spacing: 3, onPress: () => setSelectedBar(`${bucket.label} income: ${formatPaise(bucket.incomePaise)}`) },
    { value: bucket.expensePaise / 100, frontColor: colors.chartExpense, label: bucket.label, spacing: 15, onPress: () => setSelectedBar(`${bucket.label} expenses: ${formatPaise(bucket.expensePaise)}`) },
  ]);
  const pieData = data?.categories.map((category, index) => ({
    value: category.amountPaise / 100, color: categoryChartColors[index % categoryChartColors.length],
    focused: selectedCategory?.id === category.id, onPress: () => setSelectedCategoryId(category.id),
  })) ?? [];
  const trendBuckets = trend?.buckets ?? [];
  const trendHasExpenses = trendBuckets.some((item) => item.expensePaise > 0);
  const trendPoints = trendBuckets.map((bucket, index) => ({ value: bucket.expensePaise / 100,
    label: visible?.trendPeriod === '30d' ? (index % 5 === 0 || index === trendBuckets.length - 1 ? bucket.label : '') : bucket.label,
    onPress: () => setSelectedTrend(`${bucket.key}: ${formatPaise(bucket.expensePaise)}`), }));

  return <Screen title="Analytics" subtitle="Understand your spending patterns">
    <PeriodSelector value={period} onChange={(next) => { if (next === period) return; setPeriod(next); setSelectedCategoryId(null); setSelectedBar(null); }} />
    {pending && <ActivityIndicator color={colors.primary} style={styles.loading} />}
    {error?.key === selectionKey && <Text accessibilityRole="alert" style={styles.error}>{error.message}</Text>}
    {data && <>
      {data.summary.transactionCount === 0 && <EmptyState icon={<ChartNoAxesCombined color={colors.primary} size={32} />}
        title="No transactions for this period" description="Try another reporting period or add a transaction." />}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{data.bounds.label} overview</Text>
        <View style={styles.metric}><Text style={styles.muted}>Income</Text><Text style={[styles.amount, { color: colors.income }]}>{formatPaise(data.summary.incomePaise)}</Text></View>
        <View style={styles.metric}><Text style={styles.muted}>Expenses</Text><Text style={[styles.amount, { color: colors.expense }]}>{formatPaise(data.summary.expensePaise)}</Text></View>
        <View style={styles.metric}><Text style={styles.muted}>Net cash flow</Text><Text style={styles.amount}>{formatPaise(data.summary.netPaise)}</Text></View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Income vs Expenses</Text>
        <Text style={styles.muted}>{visible?.period === 'week' ? 'Daily comparison' : visible?.period === 'all' ? 'Monthly comparison' : 'Grouped by week of month'}</Text>
        <View style={styles.legend}><Legend color={colors.income} label="Income" /><Legend color={colors.chartExpense} label="Expenses" /></View>
        {comparisonHasValues ? <>
          <View style={styles.chartViewport} onLayout={(event) => setComparisonWidth(Math.round(event.nativeEvent.layout.width))}>
          {comparisonWidth > 0 && <BarChart data={barData} frontColor={colors.primary} width={Math.max(1, comparisonWidth - 50)} height={170} barWidth={12} spacing={8} isAnimated={false}
            yAxisTextStyle={styles.axis} xAxisLabelTextStyle={styles.axis} xAxisColor={colors.secondaryText}
            yAxisColor={colors.secondaryText} rulesColor={colors.background} formatYLabel={axisRupees}
            noOfSections={4} />}
          </View>
          <Text style={styles.selectedValue}>{selectedBar ?? 'Tap a bar to inspect its value'}</Text>
        </> : <Text style={styles.emptyText}>No income or expenses recorded for this period.</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Spending by category</Text>
        {pieData.length ? <>
          <View style={styles.donut}><PieChart data={pieData} donut radius={96} innerRadius={57} focusOnPress
            innerCircleColor={colors.surface} centerLabelComponent={() => <View style={styles.donutCenter}><Text style={styles.muted}>Expenses</Text><Text style={styles.donutAmount}>{formatPaise(data.summary.expensePaise)}</Text></View>} /></View>
          {selectedCategory && <Text style={styles.selectedValue}>{selectedCategory.name}: {formatPaise(selectedCategory.amountPaise)} · {percentOf(selectedCategory.amountPaise, data.summary.expensePaise).toFixed(1)}%</Text>}
          {data.categories.map((category, index) => <Pressable key={category.id} onPress={() => setSelectedCategoryId(category.id)} accessibilityRole="button" style={[styles.categoryRow, selectedCategory?.id === category.id && styles.selectedCategory]}>
            <View style={styles.categoryTop}><View style={[styles.colorDot, { backgroundColor: categoryChartColors[index % categoryChartColors.length] }]} /><Text style={styles.categoryName}>{category.name}</Text><Text style={styles.categoryValue}>{formatPaise(category.amountPaise)} · {percentOf(category.amountPaise, data.summary.expensePaise).toFixed(1)}%</Text></View>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { backgroundColor: categoryChartColors[index % categoryChartColors.length], width: `${percentOf(category.amountPaise, data.summary.expensePaise)}%` }]} /></View>
          </Pressable>)}
        </> : <Text style={styles.emptyText}>No expenses recorded for this period.</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Spending trend</Text>
        <View style={styles.trendOptions}>{trendOptions.map((option) => <Pressable key={option.value} onPress={() => { if (option.value === trendPeriod) return; setTrendPeriod(option.value); setSelectedTrend(null); }} style={[styles.trendChoice, trendPeriod === option.value && styles.trendSelected]} accessibilityRole="button" accessibilityState={{ selected: trendPeriod === option.value }}><Text style={[styles.trendLabel, trendPeriod === option.value && styles.trendSelectedLabel]}>{option.label}</Text></Pressable>)}</View>
        {trendHasExpenses ? <>
          <View style={styles.chartViewport} onLayout={(event) => setTrendWidth(Math.round(event.nativeEvent.layout.width))}>
          {trendWidth > 0 && <LineChart data={trendPoints} width={Math.max(1, trendWidth - 50)} height={175} spacing={visible?.trendPeriod === '30d' ? 27 : visible?.trendPeriod === '7d' ? 38 : 36} isAnimated={false}
            color={colors.primary} thickness={3} dataPointsColor={colors.primary} dataPointsRadius={4}
            yAxisTextStyle={styles.axis} xAxisLabelTextStyle={styles.axis} xAxisColor={colors.secondaryText}
            yAxisColor={colors.secondaryText} rulesColor={colors.background} formatYLabel={axisRupees}
            noOfSections={4} scrollToEnd={visible?.trendPeriod === '30d'} />}
          </View>
          <Text style={styles.selectedValue}>{selectedTrend ?? 'Tap a point to inspect spending'}</Text>
        </> : <Text style={styles.emptyText}>No expenses recorded for {trend?.bounds.label.toLowerCase() ?? 'this period'}.</Text>}
      </View>

      <SpendingHeatmap />
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Spending Insights</Text>
        <Insight label="Highest spending category" value={topCategory ? `${topCategory.name} · ${formatPaise(topCategory.amountPaise)} (${percentOf(topCategory.amountPaise, data.summary.expensePaise).toFixed(1)}%)` : 'No expenses recorded'} />
        <Insight label="Largest expense" value={largest ? `${largest.title} · ${formatPaise(largest.amountPaise)} · ${formatDate(largest.transactionDate)} · ${largest.categoryName}` : 'No expenses recorded'} />
        <Insight label={`Average daily spending · ${data.bounds.label}`} value={formatPaise(averageDailyPaise(data.summary.expensePaise, data.bounds))} />
        <Insight label="Transactions" value={`${data.summary.transactionCount} total · ${data.summary.incomeCount} income · ${data.summary.expenseCount} expense`} />
        <Insight label="Most frequent expense category" value={mostFrequent ? `${mostFrequent.name} · ${mostFrequent.count} transactions` : 'No expenses recorded'} />
        <Insight label="Spending comparison" value={change ? `This month: ${change.percent.toFixed(1)}% ${change.direction} vs previous full month` : 'Not enough historical data for a comparison.'} />
      </View>

      {visible && <AnalyticsBudgetComparison period={visible.period} />}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Top five expenses</Text>
        {data.largestExpenses.length ? data.largestExpenses.map((item) => <Pressable key={item.id} onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: item.id } })} accessibilityRole="button" style={styles.expenseRow}>
          <View style={styles.expenseDetails}><Text style={styles.expenseTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.muted}>{item.categoryName} · {formatDate(item.transactionDate)}</Text></View><Text style={styles.expenseAmount}>{formatPaise(item.amountPaise)}</Text>
        </Pressable>) : <Text style={styles.emptyText}>No expenses recorded for this period.</Text>}
      </View>
    </>}
  </Screen>;
}

function Legend({ color, label }: { color: string; label: string }) {
  return <View style={styles.legendItem}><View style={[styles.colorDot, { backgroundColor: color }]} /><Text style={styles.muted}>{label}</Text></View>;
}
function Insight({ label, value }: { label: string; value: string }) {
  return <View style={styles.insight}><Text style={styles.muted}>{label}</Text><Text style={styles.insightValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  loading: { marginTop: 30 }, error: { color: colors.expense, marginTop: 16 },
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 18, marginTop: 16, overflow: 'hidden' },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 13 },
  muted: { color: colors.secondaryText, fontSize: 12, lineHeight: 17 },
  metric: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingVertical: 7 },
  amount: { color: colors.text, fontSize: 16, fontWeight: '800' },
  legend: { flexDirection: 'row', gap: 18, marginTop: 10, marginBottom: 12 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chartViewport: { width: '100%', overflow: 'hidden' },
  colorDot: { width: 10, height: 10, borderRadius: 5 }, axis: { color: colors.secondaryText, fontSize: 10 },
  selectedValue: { color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 12 }, emptyText: { color: colors.secondaryText, fontSize: 13, lineHeight: 20 },
  donut: { alignItems: 'center', marginVertical: 8 }, donutCenter: { alignItems: 'center', width: 108 }, donutAmount: { color: colors.text, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  categoryRow: { borderRadius: 12, padding: 9, marginTop: 7 }, selectedCategory: { backgroundColor: colors.background },
  categoryTop: { flexDirection: 'row', alignItems: 'center', gap: 7 }, categoryName: { color: colors.text, fontSize: 12, flex: 1 },
  categoryValue: { color: colors.text, fontSize: 11, fontWeight: '700' },
  progressTrack: { backgroundColor: colors.background, height: 5, borderRadius: 3, marginTop: 9 }, progressFill: { height: 5, borderRadius: 3 },
  trendOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 13 }, trendChoice: { borderRadius: 15, backgroundColor: colors.background, paddingHorizontal: 10, paddingVertical: 8 },
  trendSelected: { backgroundColor: colors.primary }, trendLabel: { color: colors.secondaryText, fontSize: 11, fontWeight: '700' }, trendSelectedLabel: { color: colors.background },
  insight: { borderTopColor: colors.background, borderTopWidth: 1, paddingVertical: 11, gap: 5 }, insightValue: { color: colors.text, fontSize: 13, fontWeight: '600', lineHeight: 19 },
  expenseRow: { borderTopColor: colors.background, borderTopWidth: 1, paddingVertical: 12, flexDirection: 'row', gap: 10, alignItems: 'center' },
  expenseDetails: { flex: 1, gap: 4 }, expenseTitle: { color: colors.text, fontSize: 14, fontWeight: '700' }, expenseAmount: { color: colors.expense, fontSize: 13, fontWeight: '800' },
});
