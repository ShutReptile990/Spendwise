import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/theme/palette';

type Props = { title: string; subtitle?: string; children: ReactNode; action?: ReactNode; titleIcon?: ReactNode };

export function Screen({ title, subtitle, children, action, titleIcon }: Props) {
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.content, action ? styles.withAction : null]} keyboardShouldPersistTaps="handled">
        <View style={styles.heading}>
          <View style={styles.titleRow}>{titleIcon}<Text style={[styles.title, { color: colors.text }]}>{title}</Text></View>
          {subtitle ? <Text style={[styles.subtitle, { color: colors.secondaryText }]}>{subtitle}</Text> : null}
        </View>
        {children}
      </ScrollView>
      {action ? <View style={styles.action}>{action}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 32 },
  withAction: { paddingBottom: 106 },
  action: { position: 'absolute', right: 22, bottom: 20 },
  heading: { marginBottom: 26, gap: 7 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.7 },
  subtitle: { fontSize: 14, lineHeight: 21 },
});
