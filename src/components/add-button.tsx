import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '@/theme/palette';

export function AddButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add transaction"
      onPress={() => router.push('/transaction/new')}
      style={[styles.button, { backgroundColor: colors.primary }]}>
      <Plus color={colors.background} size={22} strokeWidth={2.5} />
      <Text style={[styles.label, { color: colors.background }]}>Add transaction</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 21, paddingVertical: 15 },
  label: { fontSize: 15, fontWeight: '700' },
});
