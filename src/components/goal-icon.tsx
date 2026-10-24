import { Gift, House, Plane, Shield, Target } from 'lucide-react-native';

import { colors } from '@/theme/palette';

export const goalIcons = [
  { value: 'target', label: 'Goal' }, { value: 'travel', label: 'Travel' },
  { value: 'emergency', label: 'Emergency' }, { value: 'gift', label: 'Gift' }, { value: 'home', label: 'Home' },
] as const;

export function GoalIcon({ icon, size = 23 }: { icon: string; size?: number }) {
  if (icon === 'travel') return <Plane color={colors.primary} size={size} />;
  if (icon === 'emergency') return <Shield color={colors.primary} size={size} />;
  if (icon === 'gift') return <Gift color={colors.primary} size={size} />;
  if (icon === 'home') return <House color={colors.primary} size={size} />;
  return <Target color={colors.primary} size={size} />;
}
