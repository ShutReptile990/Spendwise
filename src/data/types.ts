export type TransactionType = 'income' | 'expense';

export const paymentMethods = [
  'UPI',
  'Cash',
  'Debit Card',
  'Credit Card',
  'Bank Transfer',
  'Other',
] as const;

export type PaymentMethod = (typeof paymentMethods)[number];

export type Category = {
  id: string;
  type: TransactionType;
  name: string;
  icon: string;
};

export type TransactionInput = {
  type: TransactionType;
  amountPaise: number;
  title: string;
  categoryId: string;
  paymentMethod: PaymentMethod;
  notes: string | null;
  transactionDate: number;
};

export type TransactionRecord = TransactionInput & {
  id: string;
  categoryName: string;
  categoryIcon: string;
  createdAt: number;
  updatedAt: number;
};

export type Totals = { incomePaise: number; expensePaise: number; balancePaise: number };
