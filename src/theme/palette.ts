export const colors = {
  background: '#0A0F1E',
  surface: '#1B2A41',
  primary: '#3B82F6',
  secondaryText: '#94A3B8',
  text: '#E2E8F0',
  border: '#94A3B8',
  placeholder: '#94A3B8',
  income: '#22C55E',
  expense: '#EF4444',
  chartExpense: '#F97373',
  warning: '#F59E0B',
} as const;

// Zero is Navy; positive daily spending progresses from light to dark blue.
export const heatmapColors = ['#1B2A41', '#BFDBFE', '#93C5FD', '#60A5FA', '#3B82F6', '#1D4ED8'] as const;
