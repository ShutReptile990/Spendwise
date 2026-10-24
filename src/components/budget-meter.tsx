import { StyleSheet, Text, View } from 'react-native';

import type { BudgetUsage } from '@/data/budgets';
import { formatPaise } from '@/domain/money';
import { colors } from '@/theme/palette';

export function BudgetMeter({ usage }: { usage: BudgetUsage }) {
  const tint = usage.status === 'Exceeded' || usage.status === 'Limit Reached' ? colors.expense
    : usage.status === 'Near Limit' ? colors.warning : colors.primary;
  return <>
    <View style={styles.row}><Text style={styles.label}>Spent</Text><Text style={styles.value}>{formatPaise(usage.spentPaise)} / {formatPaise(usage.amountPaise)}</Text></View>
    <View style={styles.track}><View style={[styles.fill, { width: `${usage.progress * 100}%`, backgroundColor: tint }]} /></View>
    <View style={styles.row}><Text style={[styles.status, { color: tint }]}>{usage.status} · {usage.usedPercent.toFixed(1)}%</Text>
      <Text style={styles.label}>{usage.remainingPaise < 0 ? 'Over by' : 'Remaining'} {formatPaise(Math.abs(usage.remainingPaise))}</Text></View>
  </>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  label: { color: colors.secondaryText, fontSize: 12 },
  value: { color: colors.text, fontSize: 12, fontWeight: '700' },
  status: { fontSize: 12, fontWeight: '800' },
  track: { height: 8, borderRadius: 5, backgroundColor: colors.background, overflow: 'hidden', marginVertical: 10 },
  fill: { height: '100%', borderRadius: 5 },
});
