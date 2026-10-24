import { router, useFocusEffect, type Href } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ChevronRight, House, Plus, Target } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { GoalIcon } from '@/components/goal-icon';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { getGoals, type Goal } from '@/data/savings-goals';
import { useTransactionEvents } from '@/data/transaction-events';
import { allocationSummary, goalProgress } from '@/domain/savings-goals';
import { formatPaise } from '@/domain/money';
import { colors } from '@/theme/palette';

export default function GoalsScreen() {
  const db = useSQLiteContext();
  const { goalRevision } = useTransactionEvents();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useFocusEffect(useCallback(() => {
    void goalRevision;
    let active = true;
    getGoals(db).then((rows) => { if (active) { setGoals(rows); setLoading(false); setError(''); } })
      .catch(() => { if (active) { setLoading(false); setError('Could not load savings goals.'); } });
    return () => { active = false; };
  }, [db, goalRevision]));
  const summary = allocationSummary(goals);
  return <Screen title="Savings Goals" subtitle="Plan what your money is for"
    titleIcon={<Pressable accessibilityRole="button" accessibilityLabel="Go to Home" onPress={() => router.navigate('/')}
      style={styles.homeButton}><House color={colors.primary} size={23} /></Pressable>}>
    <View style={styles.summary}>
      <Text style={styles.muted}>Allocated savings · {summary.activeCount} active goals</Text>
      <Text style={styles.total}>{formatPaise(summary.allocatedPaise)}</Text>
      <Text style={styles.muted}>Remaining to targets: {formatPaise(summary.remainingPaise)}</Text>
      <Text style={styles.disclosure}>Goal allocations are separate from expenses and income. They are recorded plans, not verified bank balances.</Text>
    </View>
    <PrimaryButton label="Create Goal" onPress={() => router.push('/goals/manage' as Href)} icon={<Plus color={colors.background} size={20} />} />
    {loading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {!loading && goals.length === 0 ? <View style={styles.empty}><Target color={colors.primary} size={30} /><Text style={styles.name}>No savings goals yet</Text><Text style={styles.muted}>Create a goal to start tracking allocations.</Text></View> : null}
    {goals.map((goal) => {
      const progress = goalProgress(goal.targetPaise, goal.savedPaise);
      return <Pressable key={goal.id} accessibilityRole="button" onPress={() => router.push(`/goals/${encodeURIComponent(goal.id)}` as Href)} style={styles.card}>
        <View style={styles.top}><GoalIcon icon={goal.icon} /><Text style={styles.name} numberOfLines={1}>{goal.name}</Text><ChevronRight color={colors.secondaryText} size={18} /></View>
        <Text style={styles.muted}>Saved {formatPaise(goal.savedPaise)} / {formatPaise(goal.targetPaise)}</Text>
        <View style={styles.track}><View style={[styles.fill, { width: `${progress.visualPercent}%` }]} /></View>
        <View style={styles.bottom}><Text style={styles.muted}>{progress.percent}% · {goal.status === 'completed' ? 'Completed' : goal.status[0].toUpperCase() + goal.status.slice(1)}</Text><Text style={styles.muted}>Remaining {formatPaise(progress.remainingPaise)}</Text></View>
        {goal.targetDate ? <Text style={styles.muted}>Target: {goal.targetDate}</Text> : null}
      </Pressable>;
    })}
  </Screen>;
}

const styles = StyleSheet.create({
  homeButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 14 },
  summary: { backgroundColor: colors.surface, borderRadius: 20, padding: 18, marginBottom: 14, gap: 5 },
  muted: { color: colors.secondaryText, fontSize: 12 }, total: { color: colors.text, fontSize: 26, fontWeight: '800' },
  disclosure: { color: colors.secondaryText, fontSize: 11, lineHeight: 16, marginTop: 7 },
  card: { backgroundColor: colors.surface, padding: 17, borderRadius: 19, marginTop: 12, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 }, name: { color: colors.text, fontSize: 16, fontWeight: '800', flex: 1 },
  track: { backgroundColor: colors.background, height: 8, borderRadius: 5, overflow: 'hidden' }, fill: { backgroundColor: colors.primary, height: 8, borderRadius: 5 },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', gap: 5, flexWrap: 'wrap' },
  loading: { marginTop: 28 }, error: { color: colors.expense, marginTop: 15 },
  empty: { backgroundColor: colors.surface, alignItems: 'center', gap: 9, marginTop: 18, padding: 22, borderRadius: 20 },
});
