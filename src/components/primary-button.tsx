import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '@/theme/palette';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: ReactNode;
};

export function PrimaryButton({ label, onPress, disabled, loading, variant = 'primary', icon }: Props) {
  const background = variant === 'primary' ? colors.primary : colors.surface;
  const foreground = variant === 'primary' ? colors.background : variant === 'danger' ? colors.expense : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: background, opacity: disabled ? 0.5 : pressed ? 0.82 : 1 }]}>
      {loading ? <ActivityIndicator color={foreground} /> : icon}
      <Text style={[styles.label, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 18 },
  label: { fontSize: 15, fontWeight: '700' },
});
