import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import type { ReportingPeriod } from '@/domain/analytics';
import { colors } from '@/theme/palette';

const options: { value: ReportingPeriod; label: string }[] = [
  { value: 'week', label: 'This Week' }, { value: 'month', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' }, { value: 'all', label: 'All Time' },
];

export function PeriodSelector({ value, onChange }: { value: ReportingPeriod; onChange: (period: ReportingPeriod) => void }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
    {options.map((option) => <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: value === option.value }}
      onPress={() => onChange(option.value)} style={[styles.choice, value === option.value && styles.selected]}>
      <Text style={[styles.label, value === option.value && styles.selectedLabel]}>{option.label}</Text>
    </Pressable>)}
  </ScrollView>;
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingBottom: 2 },
  choice: { backgroundColor: colors.surface, borderRadius: 18, paddingHorizontal: 13, minHeight: 36, justifyContent: 'center' },
  selected: { backgroundColor: colors.primary },
  label: { color: colors.secondaryText, fontSize: 12, fontWeight: '700' },
  selectedLabel: { color: colors.background },
});
