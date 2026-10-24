import {
  BookOpen, BriefcaseBusiness, BusFront, CircleEllipsis, Clapperboard, Gift,
  HeartPulse, House, Laptop, ReceiptText, RotateCcw, ShoppingBag,
  UtensilsCrossed, Wallet, type LucideIcon,
} from 'lucide-react-native';

import { colors } from '@/theme/palette';

const icons: Record<string, LucideIcon> = {
  food: UtensilsCrossed,
  transport: BusFront,
  shopping: ShoppingBag,
  education: BookOpen,
  entertainment: Clapperboard,
  bills: ReceiptText,
  health: HeartPulse,
  rent: House,
  other: CircleEllipsis,
  salary: BriefcaseBusiness,
  pocket: Wallet,
  freelance: Laptop,
  gift: Gift,
  refund: RotateCcw,
};

export function CategoryIcon({ name, size = 22, color = colors.primary }: { name: string; size?: number; color?: string }) {
  const Icon = icons[name] ?? CircleEllipsis;
  return <Icon color={color} size={size} strokeWidth={2} />;
}
