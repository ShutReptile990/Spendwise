import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { RangeSlider } from '@react-native-assets/slider';
import { X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatDate } from '@/domain/dates';
import { formatAmountInput, formatPaise } from '@/domain/money';
import { amountSliderScale, defaultTransactionFilters, parseFilterAmountPaise, sliderRangeToFilters, validateTransactionFilters, type DatePreset, type TransactionFilters } from '@/domain/transaction-filters';
import { paymentMethods, type Category, type PaymentMethod, type TransactionRecord } from '@/data/types';
import { colors } from '@/theme/palette';

const dates: { value: DatePreset; label: string }[] = [
  { value: 'all', label: 'All Time' }, { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' }, { value: 'last7', label: 'Last 7 Days' },
  { value: 'thisMonth', label: 'This Month' }, { value: 'lastMonth', label: 'Last Month' },
  { value: 'custom', label: 'Custom Range' },
];

type Props = {
  visible: boolean;
  applied: TransactionFilters;
  transactions: readonly TransactionRecord[];
  categories: readonly Category[];
  onClose: () => void;
  onApply: (filters: TransactionFilters) => void;
};

export function TransactionFilterSheet({ visible, applied, transactions, categories, onClose, onApply }: Props) {
  const [draft, setDraft] = useState<TransactionFilters>(() => ({ ...applied, categories: [...applied.categories], paymentMethods: [...applied.paymentMethods] }));
  const baseMaximum = amountSliderScale(transactions).maximumPaise;
  const [minimumInput, setMinimumInput] = useState(() => formatPaise(applied.minAmountPaise).slice(1));
  const [maximumInput, setMaximumInput] = useState(() => formatPaise(applied.maxAmountPaise ?? baseMaximum).slice(1));
  const [invalidField, setInvalidField] = useState<'min' | 'max' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ignoreBlur = useRef({ min: false, max: false });
  const sliderMaximum = amountSliderScale(transactions, Math.max(draft.minAmountPaise, draft.maxAmountPaise ?? 0)).maximumPaise;
  const selectedMaximum = draft.maxAmountPaise ?? sliderMaximum;

  const update = (patch: Partial<TransactionFilters>) => { setDraft((current) => ({ ...current, ...patch })); setError(null); };
  const commitAmount = (field: 'min' | 'max') => {
    const value = parseFilterAmountPaise(field === 'min' ? minimumInput : maximumInput);
    if (value === null) {
      setInvalidField(field);
      setError(`Enter a valid ${field === 'min' ? 'minimum' : 'maximum'} amount with up to two decimal places.`);
      return;
    }
    const min = field === 'min' ? value : draft.minAmountPaise;
    const max = field === 'max' ? value : draft.maxAmountPaise === null ? Math.max(value, selectedMaximum) : selectedMaximum;
    if (min > max) {
      setInvalidField(field);
      setError('Minimum amount cannot exceed maximum amount.');
      return;
    }
    const expanded = amountSliderScale(transactions, Math.max(min, max)).maximumPaise;
    const nextMaximum = field === 'max' ? (value === expanded ? null : value) : draft.maxAmountPaise;
    update({ minAmountPaise: min, maxAmountPaise: nextMaximum });
    setInvalidField(null);
    if (field === 'min') {
      setMinimumInput(formatPaise(value).slice(1));
      if (draft.maxAmountPaise === null && expanded !== sliderMaximum) setMaximumInput(formatPaise(expanded).slice(1));
    }
    else setMaximumInput(formatPaise(value).slice(1));
  };
  const moveRange = ([minimum, maximum]: [number, number]) => {
    ignoreBlur.current.min = true;
    ignoreBlur.current.max = true;
    const next = sliderRangeToFilters(minimum, maximum, sliderMaximum);
    update(next);
    setMinimumInput(formatPaise(next.minAmountPaise).slice(1));
    setMaximumInput(formatPaise(maximum).slice(1));
    setInvalidField(null);
  };
  const beginSlide = () => {
    ignoreBlur.current.min = true;
    ignoreBlur.current.max = true;
    Keyboard.dismiss();
  };
  const resetRange = () => {
    ignoreBlur.current.min = true;
    ignoreBlur.current.max = true;
    Keyboard.dismiss();
    update({ minAmountPaise: 0, maxAmountPaise: null });
    setMinimumInput(formatPaise(0).slice(1));
    setMaximumInput(formatPaise(baseMaximum).slice(1));
    setInvalidField(null);
  };
  const toggleCategory = (id: string) => update({ categories: draft.categories.includes(id) ? draft.categories.filter((value) => value !== id) : [...draft.categories, id] });
  const toggleMethod = (method: PaymentMethod) => update({ paymentMethods: draft.paymentMethods.includes(method) ? draft.paymentMethods.filter((value) => value !== method) : [...draft.paymentMethods, method] });
  const chooseDate = (field: 'customStartDate' | 'customEndDate') => {
    Keyboard.dismiss();
    DateTimePickerAndroid.open({
      value: new Date(draft[field] ?? Date.now()), mode: 'date', maximumDate: new Date(),
      onChange: (event, selected) => {
        if (event.type === 'set' && selected) update({ [field]: selected.getTime(), datePreset: 'custom' });
      },
    });
  };
  const apply = () => {
    const minimum = parseFilterAmountPaise(minimumInput);
    const maximum = parseFilterAmountPaise(maximumInput);
    if (minimum === null || maximum === null) { setInvalidField(minimum === null ? 'min' : 'max'); setError('Enter valid minimum and maximum amounts with up to two decimal places.'); return; }
    if (minimum > maximum) { setInvalidField('max'); setError('Minimum amount cannot exceed maximum amount.'); return; }
    const expanded = amountSliderScale(transactions, Math.max(minimum, maximum)).maximumPaise;
    const next = { ...draft, ...sliderRangeToFilters(minimum, maximum, expanded) };
    const validation = validateTransactionFilters(next);
    if (validation) { setError(validation); return; }
    onApply(next);
    Keyboard.dismiss();
    onClose();
  };
  const reset = () => { Keyboard.dismiss(); onApply(defaultTransactionFilters()); onClose(); };

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close filters" accessibilityRole="button" />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <View style={styles.headingRow}>
          <View><Text style={styles.heading}>Filter transactions</Text><Text style={styles.hint}>Fine-tune your history</Text></View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close filters" style={styles.close}><X color={colors.text} size={21} /></Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Text style={styles.label}>Amount range</Text>
          <View style={styles.amountFields}>
            <View style={styles.amountField}><Text style={styles.fieldLabel}>MIN AMOUNT</Text><View style={[styles.inputWrap, invalidField === 'min' && styles.invalidInput]}><Text style={styles.inputPrefix}>₹</Text><TextInput style={styles.input} value={minimumInput} onChangeText={(value) => { setMinimumInput(value); setInvalidField(null); setError(null); }}
              onFocus={() => { ignoreBlur.current.min = false; if (invalidField !== 'min') setMinimumInput(formatAmountInput(draft.minAmountPaise)); }}
              onBlur={() => { if (!ignoreBlur.current.min) commitAmount('min'); }} onSubmitEditing={() => commitAmount('min')}
              selectTextOnFocus keyboardType="decimal-pad" returnKeyType="done" placeholder="0.00" placeholderTextColor={colors.placeholder} accessibilityLabel="Minimum amount in rupees" /></View></View>
            <View style={styles.amountField}><Text style={styles.fieldLabel}>MAX AMOUNT</Text><View style={[styles.inputWrap, invalidField === 'max' && styles.invalidInput]}><Text style={styles.inputPrefix}>₹</Text><TextInput style={styles.input} value={maximumInput} onChangeText={(value) => { setMaximumInput(value); setInvalidField(null); setError(null); }}
              onFocus={() => { ignoreBlur.current.max = false; if (invalidField !== 'max') setMaximumInput(formatAmountInput(selectedMaximum)); }}
              onBlur={() => { if (!ignoreBlur.current.max) commitAmount('max'); }} onSubmitEditing={() => commitAmount('max')}
              selectTextOnFocus keyboardType="decimal-pad" returnKeyType="done" placeholder="0.00" placeholderTextColor={colors.placeholder} accessibilityLabel="Maximum amount in rupees" /></View></View>
          </View>
          <View style={styles.rangePanel}><RangeSlider accessibilityLabel="Amount range" style={styles.rangeSlider} minimumValue={0} maximumValue={sliderMaximum} step={1} minimumRange={0} crossingAllowed={false}
            range={[draft.minAmountPaise, selectedMaximum]} outboundColor={colors.surface} inboundColor={colors.primary} thumbTintColor={colors.primary}
            thumbStyle={styles.thumb} thumbSize={24} trackHeight={6} onSlidingStart={beginSlide} onValueChange={moveRange} /></View>
          <View style={styles.rangeLabels}><Text style={styles.hint}>₹0</Text><Text style={styles.hint}>{formatPaise(sliderMaximum)}</Text></View>
          <Pressable accessibilityRole="button" onPress={resetRange}><Text style={styles.link}>Reset Range</Text></Pressable>
          {error && invalidField && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

          <Text style={styles.label}>Categories</Text>
          <Text style={styles.hint}>Select any; none means all categories</Text>
          <View style={styles.chips}>{categories.filter((category) => draft.type === 'all' || category.type === draft.type).map((category) =>
            <Choice key={category.id} label={category.name} selected={draft.categories.includes(category.id)} onPress={() => toggleCategory(category.id)} />)}</View>

          <Text style={styles.label}>Date range</Text>
          <View style={styles.chips}>{dates.map((date) => <Choice key={date.value} label={date.label} selected={draft.datePreset === date.value} onPress={() => update({ datePreset: date.value })} />)}</View>
          {draft.datePreset === 'custom' && <View style={styles.dateRow}>
            <Pressable style={styles.dateButton} onPress={() => chooseDate('customStartDate')} accessibilityRole="button"><Text style={styles.hint}>From</Text><Text style={styles.dateText}>{draft.customStartDate === null ? 'Select date' : formatDate(draft.customStartDate)}</Text></Pressable>
            <Pressable style={styles.dateButton} onPress={() => chooseDate('customEndDate')} accessibilityRole="button"><Text style={styles.hint}>To</Text><Text style={styles.dateText}>{draft.customEndDate === null ? 'Select date' : formatDate(draft.customEndDate)}</Text></Pressable>
          </View>}

          <Text style={styles.label}>Payment methods</Text>
          <View style={styles.chips}>{paymentMethods.map((method) => <Choice key={method} label={method} selected={draft.paymentMethods.includes(method)} onPress={() => toggleMethod(method)} />)}</View>
          {error && !invalidField && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        </ScrollView>
        <View style={styles.footer}><Pressable style={styles.reset} onPress={reset} accessibilityRole="button"><Text style={styles.resetText}>RESET ALL</Text></Pressable><Pressable style={styles.apply} onPress={apply} accessibilityRole="button"><Text style={styles.applyText}>APPLY FILTERS</Text></Pressable></View>
      </SafeAreaView>
    </View>
  </Modal>;
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.chip, selected && styles.selectedChip]}>
    <Text style={[styles.chipText, selected && styles.selectedText]}>{selected ? '✓ ' : ''}{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0A0F1ECC' },
  backdrop: { ...StyleSheet.absoluteFill },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '90%' },
  headingRow: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heading: { color: colors.text, fontSize: 22, fontWeight: '800' }, hint: { color: colors.secondaryText, fontSize: 12 },
  close: { padding: 8 }, content: { paddingHorizontal: 22, paddingBottom: 24 },
  label: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 22, marginBottom: 9 },
  amountFields: { flexDirection: 'row', gap: 10 }, amountField: { flex: 1, minWidth: 0 },
  fieldLabel: { color: colors.secondaryText, fontSize: 11, fontWeight: '700', marginBottom: 7 },
  invalidInput: { borderColor: colors.expense, borderWidth: 1 },
  rangePanel: { backgroundColor: colors.background, borderRadius: 14, paddingHorizontal: 12, marginTop: 15 },
  rangeSlider: { minHeight: 48 }, thumb: { borderColor: colors.text, borderWidth: 2 },
  rangeLabels: { flexDirection: 'row', justifyContent: 'space-between' }, link: { color: colors.primary, marginTop: 8, fontWeight: '600' },
  inputWrap: { backgroundColor: colors.background, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  inputPrefix: { color: colors.text, fontSize: 16 }, input: { color: colors.text, flex: 1, minHeight: 48, fontSize: 16, paddingHorizontal: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { borderColor: colors.secondaryText, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20 },
  selectedChip: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipText: { color: colors.text, fontSize: 13 }, selectedText: { color: colors.background, fontWeight: '700' },
  dateRow: { flexDirection: 'row', gap: 10, marginTop: 12 }, dateButton: { backgroundColor: colors.background, borderRadius: 12, flex: 1, padding: 12, gap: 6 },
  dateText: { color: colors.text, fontSize: 14 }, error: { color: colors.expense, marginTop: 18 },
  footer: { flexDirection: 'row', paddingHorizontal: 22, paddingTop: 12, gap: 10 },
  reset: { backgroundColor: colors.background, borderRadius: 14, minHeight: 50, justifyContent: 'center', alignItems: 'center', flex: 1 },
  resetText: { color: colors.text, fontWeight: '700' },
  apply: { backgroundColor: colors.primary, borderRadius: 14, minHeight: 50, justifyContent: 'center', alignItems: 'center', flex: 1.4 },
  applyText: { color: colors.background, fontWeight: '800' },
});
