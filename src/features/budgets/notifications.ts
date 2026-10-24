import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

import type { BudgetAlert } from '@/data/budgets';
import { formatPaise } from '@/domain/money';
import { notificationPermissionGranted } from '@/domain/notification-permission';

const channelId = 'budget-alerts';

async function loadNotifications() {
  // Expo Go may not contain the native modules required by the installed
  // expo-notifications JS package. Never load that package during app startup.
  if (isRunningInExpoGo()) return null;
  try {
    const notifications = await import('expo-notifications');
    notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    });
    return notifications;
  } catch {
    // A development build without the notification native module can still use
    // the in-app budget status instead of crashing the whole application.
    return null;
  }
}

export async function deliverBudgetAlerts(alerts: BudgetAlert[]): Promise<boolean> {
  if (alerts.length === 0) return false;
  const Notifications = await loadNotifications();
  if (!Notifications) return false;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(channelId, {
        name: 'Budget alerts', importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const allowed = await notificationPermissionGranted(Notifications.getPermissionsAsync, Notifications.requestPermissionsAsync);
    if (!allowed) return false;

    const highest = alerts.some((alert) => alert.threshold === 100) ? 100 : 80;
    const names = alerts.map(({ budget }) => budget.categoryName ?? 'monthly budget').join(', ');
    const single = alerts.length === 1 ? alerts[0] : null;
    const title = highest === 100 ? 'Budget Limit Reached' : 'Near Budget Limit';
    const body = single
      ? single.threshold === 100
        ? `You have reached your ${formatPaise(single.budget.amountPaise)} ${single.budget.categoryName ?? 'monthly'} spending limit.`
        : `You have used at least 80% of your ${single.budget.categoryName ?? 'monthly'} budget.`
      : `${alerts.length} budgets need attention: ${names}. Open SpendWise for details.`;
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { route: '/budget' } },
      trigger: Platform.OS === 'android'
        ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, channelId }
        : null,
    });
    return true;
  } catch {
    // In-app status remains visible if the OS notification service is unavailable.
    return false;
  }
}
