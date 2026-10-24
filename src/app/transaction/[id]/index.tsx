import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryIcon } from '@/components/category-icon';
import { PrimaryButton } from '@/components/primary-button';
import { deleteTransaction, getTransactionById } from '@/data/transactions';
import { useTransactionEvents } from '@/data/transaction-events';
import type { TransactionRecord } from '@/data/types';
import { formatDateTime } from '@/domain/dates';
import { formatSignedAmount } from '@/domain/money';
import { colors } from '@/theme/palette';

export default function TransactionDetailsScreen() {
  const db = useSQLiteContext();
  const { notifyChanged } = useTransactionEvents();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [transaction, setTransaction] = useState<TransactionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    getTransactionById(db, id)
      .then((row) => { if (active) { setTransaction(row); setLoading(false); setError(row ? null : 'Transaction not found'); } })
      .catch(() => { if (active) { setLoading(false); setError('Could not load this transaction'); } });
    return () => { active = false; };
  }, [db, id]));

  function confirmDelete() {
    Alert.alert('Delete transaction?', 'Are you sure you want to delete this transaction? This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        if (deleting) return;
        setDeleting(true);
        try {
          const removed = await deleteTransaction(db, id);
          if (!removed) throw new Error('Transaction was not found');
          notifyChanged();
          ToastAndroid.show('Transaction deleted', ToastAndroid.SHORT);
          router.replace('/transactions');
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Could not delete this transaction');
          setDeleting(false);
        }
      } },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.back}><ArrowLeft color={colors.text} size={24} /></Pressable>
        <Text style={styles.heading}>Transaction details</Text>
        {loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {transaction ? (
          <>
            <View style={styles.hero}>
              <View style={styles.icon}><CategoryIcon name={transaction.categoryIcon} size={28} /></View>
              <Text style={styles.title}>{transaction.title}</Text>
              <Text style={[styles.amount, { color: transaction.type === 'income' ? colors.income : colors.expense }]}>
                {formatSignedAmount(transaction.amountPaise, transaction.type)}
              </Text>
              <Text style={styles.type}>{transaction.type === 'income' ? 'Income' : 'Expense'}</Text>
            </View>
            <View style={styles.details}>
              <Detail label="Category" value={transaction.categoryName} />
              <Detail label="Date and time" value={formatDateTime(transaction.transactionDate)} />
              <Detail label="Payment method" value={transaction.paymentMethod} />
              <Detail label="Notes" value={transaction.notes || 'None'} />
              <Detail label="Recorded" value={formatDateTime(transaction.createdAt)} />
              <Detail label="Last updated" value={formatDateTime(transaction.updatedAt)} />
              <Detail label="Transaction ID" value={transaction.id} />
            </View>
            <View style={styles.actions}>
              <PrimaryButton label="Edit transaction" variant="secondary" icon={<Pencil color={colors.text} size={18} />}
                onPress={() => router.push({ pathname: '/transaction/[id]/edit', params: { id } })} />
              <PrimaryButton label="Delete transaction" variant="danger" icon={<Trash2 color={colors.expense} size={18} />}
                disabled={deleting} onPress={confirmDelete} />
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 36 },
  back: { width: 48, height: 48, justifyContent: 'center' },
  heading: { color: colors.text, fontSize: 28, fontWeight: '800', marginTop: 8, marginBottom: 24 },
  loader: { marginTop: 40 },
  error: { color: colors.expense, textAlign: 'center', marginVertical: 18 },
  hero: { backgroundColor: colors.surface, borderRadius: 24, alignItems: 'center', padding: 28, gap: 10 },
  icon: { width: 60, height: 60, borderRadius: 18, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  amount: { fontSize: 30, fontWeight: '800' },
  type: { color: colors.secondaryText, fontSize: 13 },
  details: { backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 18, marginTop: 16 },
  detailRow: { minHeight: 60, paddingVertical: 14, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  detailLabel: { color: colors.secondaryText, fontSize: 13, flex: 1 },
  detailValue: { color: colors.text, fontSize: 14, fontWeight: '600', textAlign: 'right', flex: 1.5 },
  actions: { gap: 10, marginTop: 22 },
});
