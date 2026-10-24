import * as Crypto from 'expo-crypto';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { GoalIcon } from '@/components/goal-icon';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { createGoalEntry, deleteGoalEntry, getGoal, getGoalEntries, setGoalStatus, updateGoalEntry, type Goal, type GoalEntry } from '@/data/savings-goals';
import { useTransactionEvents } from '@/data/transaction-events';
import { formatDate } from '@/domain/dates';
import { localDateKey, localDateStart } from '@/domain/heatmap';
import { formatAmountInput, formatPaise, parseAmountToPaise } from '@/domain/money';
import { goalProgress, savingsForecast, type EntryType } from '@/domain/savings-goals';
import { colors } from '@/theme/palette';

export default function GoalDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { goalRevision, notifyGoalChanged } = useTransactionEvents();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [entries, setEntries] = useState<GoalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<{ id: string | null; type: EntryType } | null>(null);
  const [amount, setAmount] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [notes, setNotes] = useState('');

  useFocusEffect(useCallback(() => {
    void goalRevision;
    if (!id) return;
    let active = true;
    Promise.all([getGoal(db, id), getGoalEntries(db, id)]).then(([nextGoal, nextEntries]) => {
      if (active) { setGoal(nextGoal); setEntries(nextEntries); setLoading(false); setError(''); }
    }).catch(() => { if (active) { setLoading(false); setError('Could not load goal details.'); } });
    return () => { active = false; };
  }, [db, id, goalRevision]));

  const openEditor = (type: EntryType, entry?: GoalEntry) => {
    setEditor({ id: entry?.id ?? null, type }); setAmount(entry ? formatAmountInput(entry.amountPaise) : '');
    setEntryDate(entry ? localDateKey(entry.entryDate) : localDateKey(Date.now())); setNotes(entry?.notes ?? ''); setError('');
  };
  const saveEntry = async () => {
    if (!editor || submitting.current || busy || !goal) return;
    const amountPaise = parseAmountToPaise(amount);
    const date = localDateStart(entryDate.trim());
    if (!amountPaise) { setError('Enter an amount greater than zero with at most two decimals.'); return; }
    if (date === null) { setError('Enter a valid date as YYYY-MM-DD.'); return; }
    submitting.current = true; setBusy(true); setError('');
    try {
      const input = { type: editor.type, amountPaise, entryDate: date, notes: notes.trim() || null };
      if (editor.id) await updateGoalEntry(db, editor.id, input);
      else await createGoalEntry(db, goal.id, input, Crypto.randomUUID());
      setEditor(null); notifyGoalChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save entry'); }
    finally { submitting.current = false; setBusy(false); }
  };
  const removeEntry = (entry: GoalEntry) => Alert.alert('Delete ledger entry?', 'This changes the recorded saved amount.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => {
      void deleteGoalEntry(db, entry.id).then(() => notifyGoalChanged()).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not delete entry'));
    } },
  ]);
  const changeStatus = (status: 'active' | 'paused' | 'archived') => {
    if (!goal || busy) return;
    const perform = () => {
      setBusy(true);
      void setGoalStatus(db, goal.id, status).then(() => notifyGoalChanged())
        .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not update goal'))
        .finally(() => setBusy(false));
    };
    if (status === 'archived') Alert.alert('Archive goal?', 'Its contribution history will be preserved. You can restore the goal later.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Archive', style: 'destructive', onPress: perform },
    ]);
    else perform();
  };

  const progress = goal ? goalProgress(goal.targetPaise, goal.savedPaise) : null;
  const forecast = goal ? savingsForecast(goal.targetPaise, goal.savedPaise, goal.targetDate) : null;
  return <Screen title="Goal Details" subtitle="Track every contribution and withdrawal">
    {loading ? <ActivityIndicator color={colors.primary} /> : null}
    {error && !editor ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {goal && progress ? <>
      <View style={styles.card}>
        <View style={styles.heading}><GoalIcon icon={goal.icon} size={29} /><Text style={styles.title}>{goal.name}</Text></View>
        <Text style={styles.muted}>{goal.status.toUpperCase()}{goal.targetDate ? ` · Target ${goal.targetDate}` : ''}</Text>
        {goal.description ? <Text style={styles.muted}>{goal.description}</Text> : null}
        <Text style={styles.saved}>{formatPaise(goal.savedPaise)} <Text style={styles.muted}>of {formatPaise(goal.targetPaise)}</Text></Text>
        <View style={styles.track}><View style={[styles.fill, { width: `${progress.visualPercent}%` }]} /></View>
        <Text style={styles.muted}>{progress.percent}% complete · {formatPaise(progress.remainingPaise)} remaining</Text>
        {goal.status === 'completed' ? <Text style={styles.complete}>Goal reached</Text> : null}
      </View>
      <View style={styles.card}>
        <Text style={styles.section}>Savings forecast</Text>
        <Text style={styles.muted}>{forecast === null ? 'Add a target date to see an estimate.' : forecast.kind === 'complete' ? 'Target reached.' : forecast.kind === 'past' ? 'Target date has passed. Update it to see an estimate.' : `Estimated monthly saving: ${formatPaise(forecast.monthlyPaise)} over ${forecast.months} month${forecast.months === 1 ? '' : 's'}.`}</Text>
      </View>
      <View style={styles.actions}>
        <PrimaryButton label="Add Contribution" onPress={() => openEditor('contribution')} disabled={goal.status === 'archived'} />
        <PrimaryButton label="Withdraw" onPress={() => openEditor('withdrawal')} variant="secondary" disabled={goal.savedPaise === 0 || goal.status === 'archived'} />
        <PrimaryButton label="Edit Goal" onPress={() => router.push(`/goals/manage?id=${encodeURIComponent(goal.id)}` as Href)} variant="secondary" disabled={goal.status === 'archived'} />
        <PrimaryButton label={goal.status === 'archived' || goal.status === 'paused' ? 'Resume Goal' : 'Pause Goal'} onPress={() => changeStatus(goal.status === 'archived' || goal.status === 'paused' ? 'active' : 'paused')} variant="secondary" disabled={busy} />
        {goal.status !== 'archived' ? <PrimaryButton label="Archive Goal" onPress={() => changeStatus('archived')} variant="danger" disabled={busy} /> : null}
      </View>
      <Text style={styles.section}>Contribution history</Text>
      {entries.length === 0 ? <Text style={styles.muted}>No contributions or withdrawals yet.</Text> : null}
      {entries.map((entry) => <View key={entry.id} style={styles.entry}>
        <View style={styles.entryTop}><Text style={[styles.entryAmount, entry.type === 'withdrawal' && styles.withdrawal]}>{entry.type === 'contribution' ? '+' : '−'}{formatPaise(entry.amountPaise)}</Text><Text style={styles.muted}>{formatDate(entry.entryDate)}</Text></View>
        <Text style={styles.muted}>{entry.type === 'contribution' ? 'Contribution' : 'Withdrawal'}{entry.notes ? ` · ${entry.notes}` : ''}</Text>
        {goal.status !== 'archived' ? <View style={styles.entryActions}><Pressable accessibilityRole="button" onPress={() => openEditor(entry.type, entry)}><Text style={styles.link}>Edit</Text></Pressable><Pressable accessibilityRole="button" onPress={() => removeEntry(entry)}><Text style={styles.delete}>Delete</Text></Pressable></View> : null}
      </View>)}
      <Text style={styles.disclosure}>Allocations are held in a separate ledger. They do not create expenses or income and are not a verified bank balance.</Text>
    </> : !loading ? <Text style={styles.error}>Goal not found.</Text> : null}
    <Modal visible={!!editor} animationType="slide" transparent onRequestClose={() => setEditor(null)}>
      <View style={styles.overlay}><View style={styles.modal}>
        <ScrollView keyboardShouldPersistTaps="handled"><Text style={styles.section}>{editor?.id ? 'Edit' : 'Add'} {editor?.type === 'withdrawal' ? 'Withdrawal' : 'Contribution'}</Text>
          <Text style={styles.label}>Amount (₹)</Text><TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="2000.00" placeholderTextColor={colors.placeholder} style={styles.input} />
          <Text style={styles.label}>Date</Text><TextInput value={entryDate} onChangeText={setEntryDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.placeholder} style={styles.input} maxLength={10} />
          <Text style={styles.label}>Note · optional</Text><TextInput value={notes} onChangeText={setNotes} placeholder="Add a note" placeholderTextColor={colors.placeholder} style={styles.input} maxLength={1000} />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <View style={styles.modalActions}><PrimaryButton label="Save Entry" onPress={() => void saveEntry()} loading={busy} /><PrimaryButton label="Cancel" onPress={() => { setEditor(null); setError(''); }} variant="secondary" disabled={busy} /></View>
        </ScrollView>
      </View></View>
    </Modal>
  </Screen>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, padding: 19, borderRadius: 20, gap: 10, marginBottom: 13 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 11 }, title: { color: colors.text, fontSize: 21, fontWeight: '800', flex: 1 },
  muted: { color: colors.secondaryText, fontSize: 12, lineHeight: 18 }, saved: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 6 },
  track: { backgroundColor: colors.background, height: 9, borderRadius: 5, overflow: 'hidden' }, fill: { backgroundColor: colors.primary, height: 9, borderRadius: 5 },
  complete: { color: colors.primary, fontWeight: '700', fontSize: 12 }, section: { color: colors.text, fontSize: 17, fontWeight: '800', marginVertical: 9 },
  actions: { gap: 9, marginBottom: 18 }, entry: { backgroundColor: colors.surface, borderRadius: 15, padding: 14, marginBottom: 9, gap: 6 },
  entryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, entryAmount: { color: colors.primary, fontSize: 15, fontWeight: '800' }, withdrawal: { color: colors.expense },
  entryActions: { flexDirection: 'row', gap: 24, paddingVertical: 7 }, link: { color: colors.primary, fontWeight: '700' }, delete: { color: colors.expense, fontWeight: '700' },
  disclosure: { color: colors.secondaryText, fontSize: 11, lineHeight: 17, marginTop: 12 }, error: { color: colors.expense, marginVertical: 10 },
  overlay: { flex: 1, backgroundColor: '#0A0F1ECC', justifyContent: 'flex-end' }, modal: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, maxHeight: '85%' },
  label: { color: colors.text, fontSize: 12, marginTop: 9, marginBottom: 5 }, input: { backgroundColor: colors.background, color: colors.text, borderRadius: 12, minHeight: 49, paddingHorizontal: 13 },
  modalActions: { gap: 9, marginTop: 19, marginBottom: 20 },
});
