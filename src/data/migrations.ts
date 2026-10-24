import type { SQLiteDatabase } from 'expo-sqlite';

import { defaultCategories } from './categories.ts';

export const DATABASE_VERSION = 3;

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if (!result) throw new Error('Unable to read the database schema version');
  if (result.user_version > DATABASE_VERSION) throw new Error('This database was created by a newer SpendWise version');
  if (result.user_version === DATABASE_VERSION) return;

  await db.withTransactionAsync(async () => {
    if (result.user_version < 1) {
      const existing = await db.getFirstAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('categories', 'transactions') LIMIT 1"
      );
      if (existing) throw new Error('Unversioned financial tables already exist; migration stopped to protect the data');

      await db.execAsync(`
        CREATE TABLE categories (
          id TEXT PRIMARY KEY NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
          name TEXT NOT NULL,
          icon TEXT NOT NULL,
          UNIQUE (type, name)
        );
        CREATE TABLE transactions (
          id TEXT PRIMARY KEY NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
          amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
          title TEXT NOT NULL CHECK (length(trim(title)) > 0),
          category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
          payment_method TEXT NOT NULL CHECK (payment_method IN ('UPI', 'Cash', 'Debit Card', 'Credit Card', 'Bank Transfer', 'Other')),
          notes TEXT,
          transaction_date INTEGER NOT NULL CHECK (transaction_date > 0),
          created_at INTEGER NOT NULL CHECK (created_at > 0),
          updated_at INTEGER NOT NULL CHECK (updated_at > 0)
        );
        CREATE INDEX idx_transactions_date ON transactions(transaction_date DESC);
        CREATE INDEX idx_transactions_type ON transactions(type);
        CREATE INDEX idx_transactions_category ON transactions(category_id);
        CREATE TRIGGER transactions_category_type_insert
        BEFORE INSERT ON transactions
        WHEN (SELECT type FROM categories WHERE id = NEW.category_id) != NEW.type
        BEGIN SELECT RAISE(ABORT, 'Category type does not match transaction type'); END;
        CREATE TRIGGER transactions_category_type_update
        BEFORE UPDATE OF type, category_id ON transactions
        WHEN (SELECT type FROM categories WHERE id = NEW.category_id) != NEW.type
        BEGIN SELECT RAISE(ABORT, 'Category type does not match transaction type'); END;
      `);

      for (const category of defaultCategories) {
        await db.runAsync(
          'INSERT INTO categories (id, type, name, icon) VALUES (?, ?, ?, ?)',
          category.id, category.type, category.name, category.icon
        );
      }
    }
    if (result.user_version < 2) {
      await db.execAsync(`
        CREATE TABLE budgets (
          id TEXT PRIMARY KEY NOT NULL,
          year INTEGER NOT NULL CHECK (year BETWEEN 1 AND 9999),
          month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
          category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
          amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
          created_at INTEGER NOT NULL CHECK (created_at > 0),
          updated_at INTEGER NOT NULL CHECK (updated_at > 0)
        );
        CREATE UNIQUE INDEX idx_budgets_overall_month ON budgets(year, month) WHERE category_id IS NULL;
        CREATE UNIQUE INDEX idx_budgets_category_month ON budgets(year, month, category_id) WHERE category_id IS NOT NULL;
        CREATE TABLE budget_alert_history (
          budget_id TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
          threshold INTEGER NOT NULL CHECK (threshold IN (80, 100)),
          triggered_at INTEGER NOT NULL CHECK (triggered_at > 0),
          PRIMARY KEY (budget_id, threshold)
        );
        CREATE TRIGGER budgets_expense_category_insert BEFORE INSERT ON budgets
        WHEN NEW.category_id IS NOT NULL AND (SELECT type FROM categories WHERE id = NEW.category_id) != 'expense'
        BEGIN SELECT RAISE(ABORT, 'Budget category must be an expense category'); END;
        CREATE TRIGGER budgets_expense_category_update BEFORE UPDATE OF category_id ON budgets
        WHEN NEW.category_id IS NOT NULL AND (SELECT type FROM categories WHERE id = NEW.category_id) != 'expense'
        BEGIN SELECT RAISE(ABORT, 'Budget category must be an expense category'); END;
      `);
    }
    if (result.user_version < 3) {
      await db.execAsync(`
        CREATE TABLE savings_goals (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 120),
          target_amount_paise INTEGER NOT NULL CHECK (target_amount_paise > 0),
          target_date TEXT CHECK (target_date IS NULL OR (length(target_date) = 10 AND target_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
          description TEXT CHECK (description IS NULL OR length(description) <= 1000),
          icon TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'paused', 'archived')),
          created_at INTEGER NOT NULL CHECK (created_at > 0),
          updated_at INTEGER NOT NULL CHECK (updated_at > 0)
        );
        CREATE INDEX idx_savings_goals_status_date ON savings_goals(status, target_date);
        CREATE TABLE savings_goal_entries (
          id TEXT PRIMARY KEY NOT NULL,
          goal_id TEXT NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
          entry_type TEXT NOT NULL CHECK (entry_type IN ('contribution', 'withdrawal')),
          amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
          entry_date INTEGER NOT NULL CHECK (entry_date > 0),
          notes TEXT CHECK (notes IS NULL OR length(notes) <= 1000),
          created_at INTEGER NOT NULL CHECK (created_at > 0),
          updated_at INTEGER NOT NULL CHECK (updated_at > 0)
        );
        CREATE INDEX idx_savings_entries_goal_date ON savings_goal_entries(goal_id, entry_date DESC);
      `);
    }
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  });
}
