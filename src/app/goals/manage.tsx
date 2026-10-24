import * as Crypto from 'expo-crypto';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { GoalIcon, goalIcons } from '@/components/goal-icon';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { createGoal, getGoal, updateGoal } from '@/data/savings-goals';
import { useTransactionEvents } from '@/data/transaction-events';
import { localDateStart } from '@/domain/heatmap';
import { formatAmountInput, parseAmountToPaise } from '@/domain/money';
import { colors } from '@/theme/palette';

export default function ManageGoalScreen() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { notifyGoalChanged } = useTransactionEvents();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('target');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    if (!id) return;
    let active = true;
    getGoal(db, id).then((goal) => {
      if (!active) return;
      if (!goal) { setError('Goal not found'); setLoading(false); return; }
      setName(goal.name); setTarget(formatAmountInput(goal.targetPaise)); setTargetDate(goal.targetDate ?? '');
      setDescription(goal.description ?? ''); setIcon(goal.icon); setLoading(false);
    }).catch(() => { if (active) { setError('Could not load goal'); setLoading(false); } });
    return () => { active = false; };
  }, [db, id]));

  const save = async () => {
    if (submitting.current) return;
    setError('');
    const targetPaise = parseAmountToPaise(target);
    if (!targetPaise) { setError('Enter a target amount greater than zero with at most two decimals.'); return; }
    if (targetDate.trim() && localDateStart(targetDate.trim()) === null) { setError('Enter a valid target date as YYYY-MM-DD.'); return; }
    submitting.current = true; setBusy(true);
    try {
      const input = { name, targetPaise, targetDate: targetDate.trim() || null, description: description.trim() || null, icon };
      if (id) await updateGoal(db, id, input);
      else await createGoal(db, input, Crypto.randomUUID());
      notifyGoalChanged(); router.back();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save goal'); }
    finally { submitting.current = false; setBusy(false); }
  };

  return <Screen title={id ? 'Edit Goal' : 'Create Goal'} subtitle="Give your savings a purpose">
    {loading ? <ActivityIndicator color={colors.primary} /> : <View style={styles.form}>
      <Text style={styles.label}>Goal name</Text><TextInput value={name} onChangeText={setName} placeholder="New laptop" placeholderTextColor={colors.placeholder} style={styles.input} maxLength={120} />
      <Text style={styles.label}>Target amount (₹)</Text><TextInput value={target} onChangeText={setTarget} placeholder="60000.00" placeholderTextColor={colors.placeholder} style={styles.input} keyboardType="decimal-pad" />
      <Text style={styles.label}>Target date · optional</Text><TextInput value={targetDate} onChangeText={setTargetDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.placeholder} style={styles.input} keyboardType="numbers-and-punctuation" maxLength={10} />
      <Text style={styles.label}>Description · optional</Text><TextInput value={description} onChangeText={setDescription} placeholder="What are you saving for?" placeholderTextColor={colors.placeholder} style={[styles.input, styles.multiline]} multiline maxLength={1000} />
      <Text style={styles.label}>Icon</Text><View style={styles.icons}>{goalIcons.map((option) => <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={option.label} accessibilityState={{ selected: icon === option.value }} onPress={() => setIcon(option.value)} style={[styles.iconChoice, icon === option.value && styles.selectedIcon]}><GoalIcon icon={option.value} /><Text style={styles.iconText}>{option.label}</Text></Pressable>)}</View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <PrimaryButton label={id ? 'Save Changes' : 'Create Goal'} onPress={() => void save()} loading={busy} />
    </View>}
  </Screen>;
}

const styles = StyleSheet.create({
  form: { gap: 11 }, label: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 4 },
  input: { backgroundColor: colors.surface, color: colors.text, borderRadius: 14, minHeight: 52, paddingHorizontal: 15, fontSize: 15 },
  multiline: { minHeight: 90, textAlignVertical: 'top', paddingTop: 15 }, icons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  iconChoice: { backgroundColor: colors.surface, borderRadius: 12, padding: 10, minWidth: 78, alignItems: 'center', gap: 5 },
  selectedIcon: { borderColor: colors.primary, borderWidth: 2 }, iconText: { color: colors.secondaryText, fontSize: 10 },
  error: { color: colors.expense, fontSize: 13 },
});
