import { Tabs } from 'expo-router';
import { ChartNoAxesCombined, House, List, Settings2, Wallet } from 'lucide-react-native';

import { colors } from '@/theme/palette';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.secondaryText,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 66,
          paddingTop: 7,
          paddingBottom: 7,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }} />
      <Tabs.Screen name="transactions" options={{ title: 'Transactions', tabBarIcon: ({ color, size }) => <List color={color} size={size} /> }} />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics', tabBarIcon: ({ color, size }) => <ChartNoAxesCombined color={color} size={size} /> }} />
      <Tabs.Screen name="budget" options={{ title: 'Budgets', tabBarIcon: ({ color, size }) => <Wallet color={color} size={size} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color, size }) => <Settings2 color={color} size={size} /> }} />
    </Tabs>
  );
}
