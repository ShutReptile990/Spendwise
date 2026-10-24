import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, ToastAndroid, View } from 'react-native';

import { TransactionForm } from '@/components/transaction-form';
import { getTransactionById, updateTransaction } from '@/data/transactions';
import { useTransactionEvents } from '@/data/transaction-events';
import type { TransactionRecord } from '@/data/types';
import { colors } from '@/theme/palette';

export default function EditTransactionScreen() {
  const db = useSQLiteContext();
  const { notifyChanged } = useTransactionEvents();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [transaction, setTransaction] = useState<TransactionRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getTransactionById(db, id)
      .then((row) => {
        if (!active) return;
        setTransaction(row);
        if (!row) setError('Transaction not found');
      })
      .catch(() => { if (active) setError('Could not load this transaction'); });
    return () => { active = false; };
  }, [db, id]);

  if (error) return <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: 24 }}><Text style={{ color: colors.text, textAlign: 'center' }}>{error}</Text></View>;
  if (!transaction) return <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <TransactionForm initial={transaction} onSave={async (input) => {
      await updateTransaction(db, id, input);
      notifyChanged();
      ToastAndroid.show('Transaction updated', ToastAndroid.SHORT);
      router.back();
    }} />
  );
}
