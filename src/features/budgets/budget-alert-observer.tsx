import { isRunningInExpoGo } from 'expo';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';

import { evaluateBudgetAlerts } from '@/data/budgets';
import { useTransactionEvents } from '@/data/transaction-events';
import { deliverBudgetAlerts } from '@/features/budgets/notifications';
import { useCurrentMonth } from '@/features/budgets/use-current-month';

export function BudgetAlertObserver() {
  const db = useSQLiteContext();
  const { revision, budgetRevision } = useTransactionEvents();
  const { year, month } = useCurrentMonth();
  useEffect(() => {
    // Expo Go can show budget status in-app but may lack notification modules.
    // Leave thresholds unclaimed until a build capable of delivery runs.
    if (isRunningInExpoGo()) return;
    evaluateBudgetAlerts(db, { year, month }).then(deliverBudgetAlerts).catch(() => {
      // A later revision, month change, or app restart will retry evaluation.
    });
  }, [db, revision, budgetRevision, year, month]);
  return null;
}
