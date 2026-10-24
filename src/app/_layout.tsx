import { Stack } from 'expo-router';
import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/theme/palette';
import { DatabaseBoundary } from '@/components/database-boundary';
import { TransactionEventsProvider } from '@/data/transaction-events';
import { BudgetAlertObserver } from '@/features/budgets/budget-alert-observer';
import { AppLockGate, AppLockProvider } from '@/features/security/app-lock';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <NavigationBar style="light" />
      <DatabaseBoundary>
        <TransactionEventsProvider>
          <AppLockProvider><AppLockGate>
            <BudgetAlertObserver />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="transaction/new" options={{ presentation: 'modal' }} />
              <Stack.Screen name="transaction/[id]/index" />
              <Stack.Screen name="transaction/[id]/edit" options={{ presentation: 'modal' }} />
              <Stack.Screen name="goals/index" />
              <Stack.Screen name="goals/manage" options={{ presentation: 'modal' }} />
              <Stack.Screen name="goals/[id]" />
            </Stack>
          </AppLockGate></AppLockProvider>
        </TransactionEventsProvider>
      </DatabaseBoundary>
    </>
  );
}
