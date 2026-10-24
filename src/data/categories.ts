import type { Category } from './types.ts';

export const defaultCategories: readonly Category[] = [
  { id: 'expense-food', type: 'expense', name: 'Food & Drinks', icon: 'food' },
  { id: 'expense-transport', type: 'expense', name: 'Transport', icon: 'transport' },
  { id: 'expense-shopping', type: 'expense', name: 'Shopping', icon: 'shopping' },
  { id: 'expense-education', type: 'expense', name: 'Education', icon: 'education' },
  { id: 'expense-entertainment', type: 'expense', name: 'Entertainment', icon: 'entertainment' },
  { id: 'expense-bills', type: 'expense', name: 'Bills', icon: 'bills' },
  { id: 'expense-health', type: 'expense', name: 'Health', icon: 'health' },
  { id: 'expense-rent', type: 'expense', name: 'Rent', icon: 'rent' },
  { id: 'expense-other', type: 'expense', name: 'Other', icon: 'other' },
  { id: 'income-salary', type: 'income', name: 'Salary', icon: 'salary' },
  { id: 'income-pocket', type: 'income', name: 'Pocket Money', icon: 'pocket' },
  { id: 'income-freelance', type: 'income', name: 'Freelance', icon: 'freelance' },
  { id: 'income-gift', type: 'income', name: 'Gift', icon: 'gift' },
  { id: 'income-refund', type: 'income', name: 'Refund', icon: 'refund' },
  { id: 'income-other', type: 'income', name: 'Other Income', icon: 'other' },
];
