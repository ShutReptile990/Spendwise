import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TransactionRecord } from '@/data/types';
import { formatDate } from '@/domain/dates';
import { formatSignedAmount } from '@/domain/money';
import { colors } from '@/theme/palette';

import { CategoryIcon } from './category-icon';

export function TransactionCard({ transaction, onPress }: { transaction: TransactionRecord; onPress: () => void }) {
  const amountColor = transaction.type === 'income' ? colors.income : colors.expense;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${transaction.title}, ${formatSignedAmount(transaction.amountPaise, transaction.type)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.82 : 1 }]}>
      <View style={styles.icon}><CategoryIcon name={transaction.categoryIcon} /></View>
      <View style={styles.details}>
        <Text numberOfLines={1} style={styles.title}>{transaction.title}</Text>
        <Text numberOfLines={1} style={styles.subtitle}>{transaction.categoryName} · {formatDate(transaction.transactionDate)}</Text>
      </View>
      <Text style={[styles.amount, { color: amountColor }]}>{formatSignedAmount(transaction.amountPaise, transaction.type)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 18, minHeight: 76, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  details: { flex: 1, minWidth: 0, gap: 4 },
  title: { color: colors.text, fontSize: 15, fontWeight: '700' },
  subtitle: { color: colors.secondaryText, fontSize: 12 },
  amount: { fontSize: 14, fontWeight: '800' },
});
