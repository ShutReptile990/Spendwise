import { Component, type PropsWithChildren, Suspense } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SQLiteProvider } from 'expo-sqlite';

import { migrateDatabase } from '@/data/migrations';
import { colors } from '@/theme/palette';

class DatabaseErrorBoundary extends Component<PropsWithChildren, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.center}>
          <Text style={styles.title}>Unable to open SpendWise</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <Text style={styles.message}>Your existing data has not been removed.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export function DatabaseBoundary({ children }: PropsWithChildren) {
  return (
    <DatabaseErrorBoundary>
      <Suspense fallback={<View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /><Text style={styles.message}>Opening your records…</Text></View>}>
        <SQLiteProvider databaseName="spendwise.db" onInit={migrateDatabase} useSuspense>
          {children}
        </SQLiteProvider>
      </Suspense>
    </DatabaseErrorBoundary>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 12 },
  title: { color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  message: { color: colors.secondaryText, fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
