import { router, useFocusEffect, type Href } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Target, WalletCards } from 'lucide-react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { AddButton } from '@/components/add-button';
import { BudgetMeter } from '@/components/budget-meter';
import { EmptyState } from '@/components/empty-state';
import { PeriodSelector } from '@/components/period-selector';
import { Screen } from '@/components/screen';
import { TransactionCard } from '@/components/transaction-card';
import { getFinancialSummary, getFirstTransactionDate, getMonthlyComparison, type FinancialSummary } from '@/data/analytics';
import { getBudgetOverview, type BudgetOverview } from '@/data/budgets';
import { getAllTransactions, getTotals } from '@/data/transactions';
import { getGoals, type Goal } from '@/data/savings-goals';
import { useTransactionEvents } from '@/data/transaction-events';
import type { Totals, TransactionRecord } from '@/data/types';
import { reportingBounds, spendingChange, type ReportingPeriod } from '@/domain/analytics';
import { formatPaise } from '@/domain/money';
import { allocationSummary, goalProgress } from '@/domain/savings-goals';
import { useCurrentMonth } from '@/features/budgets/use-current-month';
import { colors } from '@/theme/palette';

export default function HomeScreen() {
  const db = useSQLiteContext();
  const { revision, budgetRevision, goalRevision } = useTransactionEvents();
  const currentMonth = useCurrentMonth();
  const [totals, setTotals] = useState<Totals | null>(null);
  const [recent, setRecent] = useState<TransactionRecord[]>([]);
  const [period, setPeriod] = useState<ReportingPeriod>('month');
  const [periodSummary, setPeriodSummary] = useState<FinancialSummary | null>(null);
  const [monthly, setMonthly] = useState<Awaited<ReturnType<typeof getMonthlyComparison>> | null>(null);
  const [budget, setBudget] = useState<BudgetOverview | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedKey, setLoadedKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    void budgetRevision; // Budget edits refresh the Home card.
    void goalRevision;
    let active = true;
    (async () => {
      const firstDate = period === 'all' ? await getFirstTransactionDate(db) : null;
      const bounds = reportingBounds(period, Date.now(), firstDate);
      return Promise.all([getTotals(db), getAllTransactions(db, 5), getFinancialSummary(db, bounds), getMonthlyComparison(db), getBudgetOverview(db, currentMonth), getGoals(db)]);
    })()
      .then(([nextTotals, nextRecent, nextPeriodSummary, nextMonthly, nextBudget, nextGoals]) => {
        if (!active) return;
        setTotals(nextTotals);
        setRecent(nextRecent);
        setPeriodSummary(nextPeriodSummary);
        setMonthly(nextMonthly);
        setBudget(nextBudget);
        setGoals(nextGoals);
        setLoadedKey(`${revision}:${period}`);
        setLoading(false);
        setError(null);
      })
      .catch(() => { if (active) { setLoading(false); setError('Could not load your balance. Return to this tab to retry.'); } });
    return () => { active = false; };
    // A write increments revision, so refresh even if this tab never lost focus.
  }, [db, revision, budgetRevision, goalRevision, period, currentMonth]));

  const change = monthly ? spendingChange(monthly.current.expensePaise, monthly.previous.expensePaise) : null;
  const pending = loading || (!error && loadedKey !== `${revision}:${period}`);
  const savings = allocationSummary(goals);

  return (
    <Screen title="SpendWise" titleIcon={<Image source={require('../../../assets/branding/generated/header-symbol.png')} style={styles.brandMark} accessibilityLabel="SpendWise logo" />} subtitle="Your money, at a glance" action={<AddButton />}>
      {pending ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {totals && !pending && !error ? (
        <>
          <View style={styles.balanceCard}>
            <View style={styles.balanceLabelRow}><WalletCards color={colors.primary} size={20} /><Text style={styles.balanceLabel}>All-time net balance</Text></View>
            <Text style={styles.balance}>{formatPaise(totals.balancePaise)}</Text>
            <Text style={styles.balanceHint}>Income minus expenses across all records</Text>
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <ArrowDownLeft color={colors.income} size={21} />
              <Text style={styles.summaryLabel}>Total income</Text>
              <Text style={styles.summaryAmount}>{formatPaise(totals.incomePaise)}</Text>
            </View>
            <View style={styles.summaryCard}>
              <ArrowUpRight color={colors.expense} size={21} />
              <Text style={styles.summaryLabel}>Total expenses</Text>
              <Text style={styles.summaryAmount}>{formatPaise(totals.expensePaise)}</Text>
            </View>
          </View>
          <View style={styles.periodSection}>
            <Text style={styles.sectionTitle}>Reporting period</Text>
            <PeriodSelector value={period} onChange={(next) => { setLoading(true); setPeriod(next); }} />
          </View>
          {periodSummary && <View style={styles.periodCard}>
            <Text style={styles.periodTitle}>{reportingBounds(period).label} cash flow</Text>
            <View style={styles.metricRow}><Text style={styles.metricLabel}>Income</Text><Text style={[styles.metricValue, { color: colors.income }]}>{formatPaise(periodSummary.incomePaise)}</Text></View>
            <View style={styles.metricRow}><Text style={styles.metricLabel}>Expenses</Text><Text style={[styles.metricValue, { color: colors.expense }]}>{formatPaise(periodSummary.expensePaise)}</Text></View>
            <View style={styles.metricRow}><Text style={styles.metricLabel}>Net cash flow</Text><Text style={styles.metricValue}>{formatPaise(periodSummary.netPaise)}</Text></View>
          </View>}
          {monthly && <View style={styles.periodCard}>
            <Text style={styles.periodTitle}>Monthly financial overview</Text>
            <View style={styles.metricRow}><Text style={styles.metricLabel}>Income this month</Text><Text style={styles.metricValue}>{formatPaise(monthly.current.incomePaise)}</Text></View>
            <View style={styles.metricRow}><Text style={styles.metricLabel}>Expenses this month</Text><Text style={styles.metricValue}>{formatPaise(monthly.current.expensePaise)}</Text></View>
            <View style={styles.metricRow}><Text style={styles.metricLabel}>Net this month</Text><Text style={styles.metricValue}>{formatPaise(monthly.current.netPaise)}</Text></View>
            <Text style={styles.comparison}>Previous month: {formatPaise(monthly.previous.expensePaise)} · {change ? `${change.percent.toFixed(1)}% ${change.direction} in spending` : 'No previous-period data'}</Text>
            <Text style={styles.comparison}>Current month to date compared with the previous full month</Text>
          </View>}
          {budget && <View style={styles.periodCard}>
            <Text style={styles.periodTitle}>Monthly budget</Text>
            {budget.overall ? <BudgetMeter usage={budget.overall} /> : <>
              <Text style={styles.metricLabel}>No monthly budget set.</Text>
              <Text style={styles.metricLabel}>Recorded expenses: {formatPaise(budget.spentPaise)}</Text>
            </>}
            <Pressable accessibilityRole="button" onPress={() => router.navigate('/budget' as Href)} style={styles.budgetAction}>
              <Text style={styles.seeAllText}>{budget.overall ? 'View Budget' : 'Set Budget'}</Text><ChevronRight color={colors.primary} size={16} />
            </Pressable>
          </View>}
          <View style={styles.periodCard}>
            <View style={styles.balanceLabelRow}><Target color={colors.primary} size={20} /><Text style={styles.periodTitle}>Savings Goals</Text></View>
            <View style={styles.metricRow}><Text style={styles.metricLabel}>Allocated savings · {savings.activeCount} active</Text><Text style={styles.metricValue}>{formatPaise(savings.allocatedPaise)}</Text></View>
            <View style={styles.metricRow}><Text style={styles.metricLabel}>Remaining to targets</Text><Text style={styles.metricValue}>{formatPaise(savings.remainingPaise)}</Text></View>
            {savings.upcoming ? <Text style={styles.comparison}>Nearest goal: {savings.upcoming.targetDate} · {goalProgress(savings.upcoming.targetPaise, savings.upcoming.savedPaise).percent}% complete</Text> : null}
            {savings.totalAllocatedPaise !== savings.allocatedPaise ? <Text style={styles.comparison}>Paused or archived allocations: {formatPaise(savings.totalAllocatedPaise - savings.allocatedPaise)}</Text> : null}
            <Text style={styles.comparison}>Recorded net cash flow: {formatPaise(totals.balancePaise)}</Text>
            <Text style={styles.comparison}>Unallocated recorded balance: {formatPaise(totals.balancePaise - savings.totalAllocatedPaise)}</Text>
            <Text style={styles.comparison}>Recorded net cash flow minus all current goal allocations. A planning figure, not a verified bank balance.</Text>
            <Pressable accessibilityRole="button" onPress={() => router.navigate('/goals' as Href)} style={styles.budgetAction}>
              <Text style={styles.seeAllText}>View Goals</Text><ChevronRight color={colors.primary} size={16} />
            </Pressable>
          </View>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Recent transactions</Text>
            <Pressable accessibilityRole="button" onPress={() => router.navigate('/transactions')} style={styles.seeAll}>
              <Text style={styles.seeAllText}>View All</Text><ChevronRight color={colors.primary} size={16} />
            </Pressable>
          </View>
          {recent.length === 0 ? (
            <EmptyState icon={<WalletCards color={colors.primary} size={32} />} title="No transactions yet"
              description="Your financial overview will appear here once you add your first transaction." />
          ) : (
            <View style={styles.recentList}>
              {recent.map((transaction) => (
                <TransactionCard key={transaction.id} transaction={transaction}
                  onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: transaction.id } })} />
              ))}
            </View>
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandMark: { width: 45, height: 45 },
  loading: { marginTop: 40 },
  error: { color: colors.expense, marginBottom: 16, fontSize: 14 },
  balanceCard: { backgroundColor: colors.surface, borderRadius: 24, padding: 23 },
  balanceLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  balanceLabel: { color: colors.secondaryText, fontSize: 13, fontWeight: '600' },
  balance: { color: colors.text, fontSize: 34, fontWeight: '800', marginTop: 13 },
  balanceHint: { color: colors.secondaryText, fontSize: 12, marginTop: 7 },
  summaryRow: { flexDirection: 'row', gap: 11, marginTop: 12 },
  summaryCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 19, padding: 16, minWidth: 0 },
  summaryLabel: { color: colors.secondaryText, fontSize: 12, marginTop: 12 },
  summaryAmount: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 4 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 29, marginBottom: 14 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  seeAll: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  seeAllText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  recentList: { gap: 9 },
  periodSection: { gap: 12, marginTop: 26 },
  periodCard: { backgroundColor: colors.surface, borderRadius: 19, padding: 18, marginTop: 14, gap: 10 },
  periodTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 4 },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  metricLabel: { color: colors.secondaryText, fontSize: 13 },
  metricValue: { color: colors.text, fontSize: 14, fontWeight: '700' },
  comparison: { color: colors.secondaryText, fontSize: 12, lineHeight: 17 },
  budgetAction: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 38, alignSelf: 'flex-start' },
});
