import * as Crypto from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ChevronLeft, ChevronRight, Plus, Wallet } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BudgetMeter } from '@/components/budget-meter';
import { CategoryIcon } from '@/components/category-icon';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { createBudget, deleteBudget, getBudgetHistory, getBudgetOverview, getMonthlyBudget, updateBudget, type Budget, type BudgetOverview } from '@/data/budgets';
import { useTransactionEvents } from '@/data/transaction-events';
import { getCategories } from '@/data/transactions';
import type { Category } from '@/data/types';
import { monthLabel, shiftMonth } from '@/domain/budgets';
import { formatAmountInput, formatPaise, parseAmountToPaise } from '@/domain/money';
import { useCurrentMonth } from '@/features/budgets/use-current-month';
import { colors } from '@/theme/palette';

type Editor = { budget: Budget | null; category: Category | null };

export default function BudgetScreen() {
  const db = useSQLiteContext();
  const { revision, budgetRevision, notifyBudgetChanged } = useTransactionEvents();
  const current = useCurrentMonth();
  const [offset, setOffset] = useState(0);
  const selected = useMemo(() => shiftMonth(current, offset), [current, offset]);
  const key = `${selected.year}-${selected.month}`;
  const [loaded, setLoaded] = useState<{ key: string; overview: BudgetOverview; history: { year: number; month: number }[]; categories: Category[]; previous: Budget | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [amount, setAmount] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => {
    void revision; void budgetRevision; // Refresh when transactions or limits change.
    let active = true;
    Promise.all([getBudgetOverview(db, selected), getBudgetHistory(db), getCategories(db, 'expense'), getMonthlyBudget(db, shiftMonth(selected, -1))])
      .then(([overview, history, categories, previous]) => {
        if (!active) return;
        setLoaded({ key, overview, history, categories, previous });
        setError(null);
      }).catch(() => { if (active) setError('Could not load budgets. Return to this tab to retry.'); });
    return () => { active = false; };
  }, [db, revision, budgetRevision, key, selected]));

  const data = loaded?.key === key ? loaded : null;
  const openEditor = (budget: Budget | null, category: Category | null = null) => {
    setEditor({ budget, category });
    setAmount(budget ? formatAmountInput(budget.amountPaise) : '');
    setFormError(null);
    setInputFocused(false);
  };
  const save = async () => {
    if (!editor || saving) return;
    const amountPaise = parseAmountToPaise(amount);
    if (amountPaise === null) { setFormError('Enter a valid amount greater than zero.'); return; }
    setSaving(true);
    try {
      if (editor.budget) await updateBudget(db, editor.budget.id, amountPaise);
      else await createBudget(db, { ...selected, amountPaise, categoryId: editor.category?.id }, Crypto.randomUUID());
      setEditor(null);
      notifyBudgetChanged();
    } catch { setFormError('Could not save this budget. Check whether a limit already exists for this month.'); }
    finally { setSaving(false); }
  };
  const remove = () => {
    if (!editor?.budget) return;
    const id = editor.budget.id;
    Alert.alert('Delete budget?', 'This removes the limit and its alert history. Transactions stay unchanged.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setSaving(true);
        try { await deleteBudget(db, id); setEditor(null); notifyBudgetChanged(); }
        catch { setFormError('Could not delete this budget.'); }
        finally { setSaving(false); }
      } },
    ]);
  };
  const copyPrevious = async () => {
    if (!data?.previous || data.overview.overall || saving) return;
    setSaving(true);
    try {
      await createBudget(db, { ...selected, amountPaise: data.previous.amountPaise }, Crypto.randomUUID());
      notifyBudgetChanged();
    } catch { setError('Could not copy the previous monthly budget.'); }
    finally { setSaving(false); }
  };

  return <Screen title="Budgets" subtitle="Plan your spending by calendar month">
    <View style={styles.monthNav}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setOffset((value) => value - 1)} style={styles.monthButton}><ChevronLeft color={colors.text} size={22} /></Pressable>
      <Text style={styles.monthTitle}>{monthLabel(selected)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => setOffset((value) => value + 1)} style={styles.monthButton}><ChevronRight color={colors.text} size={22} /></Pressable>
    </View>
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!data && !error && <ActivityIndicator color={colors.primary} style={styles.loading} />}
    {data && <>
      <View style={styles.card}>
        <View style={styles.heading}><Wallet color={colors.primary} size={23} /><Text style={styles.title}>Monthly budget</Text></View>
        {data.overview.overall ? <>
          <Text style={styles.limit}>{formatPaise(data.overview.overall.amountPaise)}</Text>
          <BudgetMeter usage={data.overview.overall} />
          <PrimaryButton label="Edit Budget" variant="secondary" onPress={() => openEditor(data.overview.overall)} />
        </> : <>
          <Text style={styles.muted}>No monthly budget set.</Text>
          <Text style={styles.muted}>Recorded expenses this month: {formatPaise(data.overview.spentPaise)}</Text>
          <PrimaryButton label="Set Budget" onPress={() => openEditor(null)} />
          {data.previous && <PrimaryButton label={`Copy ${monthLabel(shiftMonth(selected, -1))} limit · ${formatPaise(data.previous.amountPaise)}`} variant="secondary" onPress={copyPrevious} disabled={saving} />}
        </>}
      </View>
      <Text style={styles.section}>Category budgets</Text>
      <Text style={styles.muted}>Optional limits are separate from the monthly budget. Spending is counted once in each relevant limit.</Text>
      {data.overview.categories.map((usage) => <View key={usage.id} style={styles.card}>
        <View style={styles.heading}><CategoryIcon name={usage.categoryIcon ?? 'other'} size={21} /><Text style={styles.title}>{usage.categoryName}</Text></View>
        <BudgetMeter usage={usage} />
        <PrimaryButton label={`Edit ${usage.categoryName} Budget`} variant="secondary" onPress={() => openEditor(usage, data.categories.find((category) => category.id === usage.categoryId) ?? null)} />
      </View>)}
      {data.overview.categories.length === 0 && <Text style={styles.empty}>No category limits for this month.</Text>}
      <Text style={styles.section}>Add a category limit</Text>
      <View style={styles.categoryList}>{data.categories.filter((category) => !data.overview.categories.some((usage) => usage.categoryId === category.id)).map((category) => <Pressable key={category.id} accessibilityRole="button" onPress={() => openEditor(null, category)} style={styles.categoryChoice}>
        <CategoryIcon name={category.icon} size={19} /><Text style={styles.categoryText}>{category.name}</Text><Plus color={colors.primary} size={19} />
      </Pressable>)}</View>
      <Text style={styles.section}>Budget history</Text>
      {data.history.filter((item) => item.year < selected.year || item.year === selected.year && item.month < selected.month).map((item) => <Pressable key={`${item.year}-${item.month}`} accessibilityRole="button" onPress={() => setOffset((item.year - current.year) * 12 + item.month - current.month)} style={styles.historyRow}>
        <Text style={styles.categoryText}>{monthLabel(item)}</Text><ChevronRight color={colors.primary} size={18} />
      </Pressable>)}
      <Text style={styles.footnote}>Alerts reflect transactions manually recorded in SpendWise. They do not monitor your bank or UPI activity.</Text>
    </>}
    <Modal visible={!!editor} transparent animationType="fade" onRequestClose={() => setEditor(null)}>
      <View style={styles.modalOverlay}><View style={styles.modalCard}>
        <Text style={styles.title}>{editor?.budget ? 'Edit' : 'Set'} {editor?.category?.name ?? 'Monthly'} Budget</Text>
        <Text style={styles.muted}>{monthLabel(selected)}</Text>
        <TextInput value={amount} onChangeText={setAmount} onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)} keyboardType="decimal-pad" placeholder="Amount in rupees" placeholderTextColor={colors.placeholder} style={[styles.input, inputFocused && styles.inputFocused]} accessibilityLabel="Budget amount in rupees" />
        {formError && <Text accessibilityRole="alert" style={styles.error}>{formError}</Text>}
        <PrimaryButton label="Save Budget" onPress={save} loading={saving} />
        {editor?.budget && <PrimaryButton label="Delete Budget" variant="danger" onPress={remove} disabled={saving} />}
        <PrimaryButton label="Cancel" variant="secondary" onPress={() => setEditor(null)} disabled={saving} />
      </View></View>
    </Modal>
  </Screen>;
}

const styles = StyleSheet.create({
  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  monthButton: { backgroundColor: colors.surface, borderRadius: 14, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 18, marginTop: 16, gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  limit: { color: colors.text, fontSize: 28, fontWeight: '800' },
  section: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 27, marginBottom: 8 },
  muted: { color: colors.secondaryText, fontSize: 13, lineHeight: 19 },
  empty: { color: colors.secondaryText, fontSize: 13, marginTop: 10 },
  categoryList: { gap: 8, marginTop: 10 },
  categoryChoice: { backgroundColor: colors.surface, borderRadius: 14, minHeight: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  categoryText: { color: colors.text, fontSize: 14, flex: 1, fontWeight: '600' },
  historyRow: { borderBottomWidth: 1, borderBottomColor: colors.surface, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footnote: { color: colors.secondaryText, fontSize: 12, lineHeight: 18, marginTop: 24 },
  loading: { marginTop: 24 }, error: { color: colors.expense, fontSize: 13, marginTop: 10 },
  modalOverlay: { flex: 1, backgroundColor: '#0A0F1EDD', justifyContent: 'center', padding: 22 },
  modalCard: { backgroundColor: colors.surface, borderRadius: 22, padding: 20, gap: 14 },
  input: { backgroundColor: colors.background, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 16, minHeight: 52, fontSize: 17 },
  inputFocused: { borderColor: colors.primary },
});
