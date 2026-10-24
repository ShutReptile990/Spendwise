import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ToastAndroid } from 'react-native';

import { TransactionForm } from '@/components/transaction-form';
import { createTransaction } from '@/data/transactions';
import { useTransactionEvents } from '@/data/transaction-events';

export default function NewTransactionScreen() {
  const db = useSQLiteContext();
  const { notifyChanged } = useTransactionEvents();

  return (
    <TransactionForm onSave={async (input) => {
      await createTransaction(db, input, Crypto.randomUUID());
      notifyChanged();
      ToastAndroid.show('Transaction saved', ToastAndroid.SHORT);
      router.back();
    }} />
  );
}
