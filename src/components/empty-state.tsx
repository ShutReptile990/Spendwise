import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/palette';

type Props = { icon: ReactNode; title: string; description: string };

export function EmptyState({ icon, title, description }: Props) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.icon, { backgroundColor: colors.background }]}>{icon}</View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.description, { color: colors.secondaryText }]}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, borderWidth: 1, padding: 28, alignItems: 'center', gap: 11 },
  icon: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  description: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
