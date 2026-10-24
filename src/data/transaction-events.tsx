import { createContext, type PropsWithChildren, useCallback, useContext, useMemo, useState } from 'react';

type TransactionEvents = { revision: number; budgetRevision: number; goalRevision: number; notifyChanged: () => void; notifyBudgetChanged: () => void; notifyGoalChanged: () => void };

const Context = createContext<TransactionEvents | null>(null);

export function TransactionEventsProvider({ children }: PropsWithChildren) {
  const [revision, setRevision] = useState(0);
  const [budgetRevision, setBudgetRevision] = useState(0);
  const [goalRevision, setGoalRevision] = useState(0);
  const notifyChanged = useCallback(() => setRevision((current) => current + 1), []);
  const notifyBudgetChanged = useCallback(() => setBudgetRevision((current) => current + 1), []);
  const notifyGoalChanged = useCallback(() => setGoalRevision((current) => current + 1), []);
  const value = useMemo(() => ({ revision, budgetRevision, goalRevision, notifyChanged, notifyBudgetChanged, notifyGoalChanged }), [revision, budgetRevision, goalRevision, notifyChanged, notifyBudgetChanged, notifyGoalChanged]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTransactionEvents(): TransactionEvents {
  const value = useContext(Context);
  if (!value) throw new Error('TransactionEventsProvider is missing');
  return value;
}
