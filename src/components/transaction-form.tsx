import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { ArrowLeft, CalendarDays, Clock3 } from 'lucide-react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCategories } from '@/data/transactions';
import { paymentMethods, type Category, type PaymentMethod, type TransactionInput, type TransactionRecord, type TransactionType } from '@/data/types';
import { formatDate, formatDateTime } from '@/domain/dates';
import { formatAmountInput, parseAmountToPaise } from '@/domain/money';
import { colors } from '@/theme/palette';

import { CategoryIcon } from './category-icon';
import { PrimaryButton } from './primary-button';

type Props = {
  initial?: TransactionRecord;
  onSave: (input: TransactionInput) => Promise<void>;
};

export function TransactionForm({ initial, onSave }: Props) {
  const db = useSQLiteContext();
  const [type, setType] = useState<TransactionType>(initial?.type ?? 'expense');
  const [amount, setAmount] = useState(initial ? formatAmountInput(initial.amountPaise) : '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initial?.paymentMethod ?? 'UPI');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [date, setDate] = useState(() => new Date(initial?.transactionDate ?? Date.now()));
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<'amount' | 'title' | 'notes' | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let active = true;
    getCategories(db, type)
      .then((rows) => { if (active) setCategories(rows); })
      .catch(() => { if (active) setError('Categories could not be loaded. Please try again.'); });
    return () => { active = false; };
  }, [db, type]);

  function selectType(next: TransactionType) {
    if (next === type) return;
    setType(next);
    setCategoryId('');
    setCategories([]);
    setError(null);
  }

  function openDatePicker() {
    Keyboard.dismiss();
    DateTimePickerAndroid.open({
      value: date,
      mode: 'date',
      maximumDate: new Date(),
      onChange: (event, selected) => {
        if (event.type !== 'set' || !selected) return;
        setDate((current) => {
          const next = new Date(current);
          next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
          return next;
        });
      },
    });
  }

  function openTimePicker() {
    Keyboard.dismiss();
    DateTimePickerAndroid.open({
      value: date,
      mode: 'time',
      is24Hour: false,
      onChange: (event, selected) => {
        if (event.type !== 'set' || !selected) return;
        setDate((current) => {
          const next = new Date(current);
          next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
          return next;
        });
      },
    });
  }

  async function save() {
    if (savingRef.current) return;
    const amountPaise = parseAmountToPaise(amount);
    if (amountPaise === null) { setError('Enter an amount greater than ₹0, with up to two decimal places.'); return; }
    if (!title.trim()) { setError('Enter a transaction title.'); return; }
    if (title.trim().length > 120) { setError('Keep the title within 120 characters.'); return; }
    if (!categoryId) { setError('Choose a category.'); return; }
    if (date.getTime() > Date.now()) { setError('Choose the current or an earlier date and time.'); return; }
    if (notes.trim().length > 1000) { setError('Keep notes within 1,000 characters.'); return; }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave({ type, amountPaise, title, categoryId, paymentMethod, notes, transactionDate: date.getTime() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this transaction. Please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.back}>
            <ArrowLeft color={colors.text} size={24} />
          </Pressable>
          <Text style={styles.heading}>{initial ? 'Edit transaction' : 'Add transaction'}</Text>
          <Text style={styles.subheading}>{initial ? 'Update the details below' : 'Record where your money went'}</Text>

          <View style={styles.typeRow}>
            {(['expense', 'income'] as const).map((option) => (
              <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: type === option }} onPress={() => selectType(option)}
                style={[styles.typeButton, type === option && styles.selected]}>
                <Text style={[styles.typeText, type === option && styles.selectedText]}>{option === 'expense' ? 'Expense' : 'Income'}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Amount</Text>
          <View style={[styles.amountBox, focusedField === 'amount' && styles.focusedInput]}>
            <Text style={styles.rupee}>₹</Text>
            <TextInput
              accessibilityLabel="Amount in rupees"
              autoFocus
              keyboardType="decimal-pad"
              inputMode="decimal"
              value={amount}
              onChangeText={setAmount}
              onFocus={() => setFocusedField('amount')}
              onBlur={() => setFocusedField(null)}
              placeholder="0.00"
              placeholderTextColor={colors.placeholder}
              selectionColor={colors.primary}
              maxLength={16}
              style={styles.amountInput}
            />
          </View>

          <Text style={styles.label}>Transaction title</Text>
          <TextInput accessibilityLabel="Transaction title" value={title} onChangeText={setTitle}
            onFocus={() => setFocusedField('title')} onBlur={() => setFocusedField(null)}
            placeholder={type === 'expense' ? 'e.g. College Canteen' : 'e.g. Freelance Payment'}
            placeholderTextColor={colors.placeholder} selectionColor={colors.primary} maxLength={120}
            style={[styles.input, focusedField === 'title' && styles.focusedInput]} />

          <Text style={styles.label}>Category</Text>
          <View style={styles.categoryGrid}>
            {categories.map((category) => {
              const selected = categoryId === category.id;
              return (
                <Pressable key={category.id} accessibilityRole="button" accessibilityState={{ selected }}
                  onPress={() => setCategoryId(category.id)} style={[styles.category, selected && styles.selected]}>
                  <CategoryIcon name={category.icon} color={selected ? colors.primary : colors.secondaryText} size={23} />
                  <Text style={[styles.categoryText, selected && styles.selectedText]} numberOfLines={2}>{category.name}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Date and time</Text>
          <View style={styles.dateRow}>
            <Pressable onPress={openDatePicker} accessibilityRole="button" accessibilityLabel="Choose date" style={styles.dateButton}>
              <CalendarDays color={colors.primary} size={20} />
              <Text style={styles.dateText}>{formatDate(date.getTime())}</Text>
            </Pressable>
            <Pressable onPress={openTimePicker} accessibilityRole="button" accessibilityLabel="Choose time" style={styles.dateButton}>
              <Clock3 color={colors.primary} size={20} />
              <Text style={styles.dateText}>{formatDateTime(date.getTime()).split(' · ')[1]}</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Payment method</Text>
          <View style={styles.methodRow}>
            {paymentMethods.map((method) => (
              <Pressable key={method} accessibilityRole="button" accessibilityState={{ selected: paymentMethod === method }}
                onPress={() => setPaymentMethod(method)} style={[styles.method, paymentMethod === method && styles.selected]}>
                <Text style={[styles.methodText, paymentMethod === method && styles.selectedText]}>{method}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Notes <Text style={styles.optional}>(optional)</Text></Text>
          <TextInput accessibilityLabel="Notes" value={notes} onChangeText={setNotes} multiline maxLength={1000}
            onFocus={() => setFocusedField('notes')} onBlur={() => setFocusedField(null)}
            placeholder="Add any extra details" placeholderTextColor={colors.placeholder} selectionColor={colors.primary}
            style={[styles.input, styles.notes, focusedField === 'notes' && styles.focusedInput]} textAlignVertical="top" />

          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <PrimaryButton label={initial ? 'Save changes' : 'Save transaction'} onPress={save} loading={saving} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 36 },
  back: { width: 48, height: 48, justifyContent: 'center' },
  heading: { color: colors.text, fontSize: 28, fontWeight: '800', marginTop: 8 },
  subheading: { color: colors.secondaryText, fontSize: 14, marginTop: 5, marginBottom: 25 },
  typeRow: { backgroundColor: colors.surface, borderRadius: 16, flexDirection: 'row', padding: 4, marginBottom: 24 },
  typeButton: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  typeText: { color: colors.secondaryText, fontSize: 15, fontWeight: '700' },
  selected: { borderColor: colors.primary, borderWidth: 1.5 },
  selectedText: { color: colors.primary },
  label: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 10 },
  optional: { color: colors.secondaryText, fontWeight: '400' },
  amountBox: { backgroundColor: colors.surface, borderRadius: 18, minHeight: 78, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', marginBottom: 23, borderWidth: 1.5, borderColor: colors.surface },
  rupee: { color: colors.primary, fontSize: 29, fontWeight: '700' },
  amountInput: { color: colors.text, flex: 1, fontSize: 32, fontWeight: '800', paddingHorizontal: 9, paddingVertical: 10 },
  input: { backgroundColor: colors.surface, color: colors.text, minHeight: 52, borderRadius: 15, paddingHorizontal: 16, fontSize: 15, marginBottom: 23, borderWidth: 1.5, borderColor: colors.surface },
  focusedInput: { borderColor: colors.primary },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 23 },
  category: { backgroundColor: colors.surface, borderRadius: 15, minWidth: '30%', flexGrow: 1, flexBasis: '30%', minHeight: 86, padding: 10, alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1.5, borderColor: colors.surface },
  categoryText: { color: colors.secondaryText, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  dateRow: { flexDirection: 'row', gap: 9, marginBottom: 23 },
  dateButton: { backgroundColor: colors.surface, borderRadius: 15, minHeight: 52, paddingHorizontal: 13, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 23 },
  method: { backgroundColor: colors.surface, borderRadius: 12, minHeight: 42, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.surface },
  methodText: { color: colors.secondaryText, fontSize: 13, fontWeight: '600' },
  notes: { minHeight: 92, paddingTop: 14 },
  error: { color: colors.expense, fontSize: 13, lineHeight: 19, marginBottom: 15 },
});
