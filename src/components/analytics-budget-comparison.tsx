import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getBudgetOverview, type BudgetOverview } from '@/data/budgets';
import { useTransactionEvents } from '@/data/transaction-events';
import type { ReportingPeriod } from '@/domain/analytics';
import { monthLabel, shiftMonth } from '@/domain/budgets';
import { formatPaise } from '@/domain/money';
import { useCurrentMonth } from '@/features/budgets/use-current-month';
import { colors } from '@/theme/palette';

export function AnalyticsBudgetComparison({ period }: { period: ReportingPeriod }) {
  const db = useSQLiteContext();
  const { revision, budgetRevision } = useTransactionEvents();
  const current = useCurrentMonth();
  const selected = useMemo(() => period === 'lastMonth' ? shiftMonth(current, -1) : current, [period, current]);
  const key = `${selected.year}-${selected.month}`;
  const [loaded, setLoaded] = useState<{ key: string; overview: BudgetOverview } | null>(null);

  useFocusEffect(useCallback(() => {
    void revision; void budgetRevision; // Both kinds of edits affect the comparison.
    if (period !== 'month' && period !== 'lastMonth') return;
    let active = true;
    getBudgetOverview(db, selected).then((overview) => {
      if (active) setLoaded({ key, overview });
    }).catch(() => { if (active) setLoaded(null); });
    return () => { active = false; };
  }, [db, revision, budgetRevision, key, selected, period]));

  if (period !== 'month' && period !== 'lastMonth') return null;
  const overview = loaded?.key === key ? loaded.overview : null;
  if (!overview) return null;
  const budget = overview.overall;
  return <View style={styles.card}>
    <Text style={styles.title}>Budget comparison · {monthLabel(selected)}</Text>
    {budget ? <>
      <View style={styles.row}><Text style={styles.label}>Monthly budget</Text><Text style={styles.value}>{formatPaise(budget.amountPaise)}</Text></View>
      <View style={styles.row}><Text style={styles.label}>Actual monthly spending</Text><Text style={styles.value}>{formatPaise(overview.spentPaise)}</Text></View>
      <View style={styles.row}><Text style={styles.label}>Budget variance</Text><Text style={[styles.value, { color: budget.remainingPaise < 0 ? colors.expense : colors.income }]}>{budget.remainingPaise < 0 ? 'Over by' : 'Under by'} {formatPaise(Math.abs(budget.remainingPaise))}</Text></View>
      <View style={styles.row}><Text style={styles.label}>Budget utilization</Text><Text style={styles.value}>{budget.usedPercent.toFixed(1)}%</Text></View>
    </> : <Text style={styles.label}>No monthly budget set for {monthLabel(selected)}. Actual expenses: {formatPaise(overview.spentPaise)}.</Text>}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 18, marginTop: 16, gap: 11 },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 3 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  label: { color: colors.secondaryText, fontSize: 12, lineHeight: 18 },
  value: { color: colors.text, fontSize: 13, fontWeight: '700', textAlign: 'right' },
});
