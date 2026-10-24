import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, PixelRatio, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getSpendingForDate, getSpendingHeatmap } from '@/data/heatmap';
import { useTransactionEvents } from '@/data/transaction-events';
import { heatmapPeriods, localDateStart, type HeatmapDay, type HeatmapPeriod } from '@/domain/heatmap';
import { formatDate } from '@/domain/dates';
import { formatPaise } from '@/domain/money';
import { colors, heatmapColors } from '@/theme/palette';

const weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const daySize = 14;
const dayPitch = 17; // 14px squares with a uniform 3px gap.
const monthlyGap = 3.5;
type Detail = Awaited<ReturnType<typeof getSpendingForDate>>;

function monthGroups(days: HeatmapDay[]) {
  const groups: { label: string; days: HeatmapDay[] }[] = [];
  for (const day of days) {
    const start = localDateStart(day.date)!;
    const date = new Date(start);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (groups.at(-1)?.label !== key) groups.push({ label: key, days: [] });
    groups.at(-1)!.days.push(day);
  }
  return groups;
}

export function SpendingHeatmap() {
  const db = useSQLiteContext();
  const { revision } = useTransactionEvents();
  const [period, setPeriod] = useState<HeatmapPeriod>('current');
  const [days, setDays] = useState<HeatmapDay[]>([]);
  const [loadedKey, setLoadedKey] = useState('');
  const [loadedPeriod, setLoadedPeriod] = useState<HeatmapPeriod>('current');
  const [calendarWidth, setCalendarWidth] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const today = new Date().toDateString();
  const key = `${revision}:${today}:${period}`;

  useFocusEffect(useCallback(() => {
    let active = true;
    getSpendingHeatmap(db, period).then((result) => {
      if (active) { setDays(result); setLoadedPeriod(period); setLoadedKey(key); setError(''); }
    }).catch(() => { if (active) setError('Could not load spending calendar.'); });
    return () => { active = false; };
  }, [db, period, key]));

  useFocusEffect(useCallback(() => {
    void revision;
    if (!selected) return;
    let active = true;
    getSpendingForDate(db, selected).then((result) => { if (active) setDetail(result); })
      .catch(() => { if (active) setError('Could not load that date.'); });
    return () => { active = false; };
  }, [db, selected, revision]));

  const groups = useMemo(() => monthGroups(days), [days]);
  const monthlyView = loadedPeriod === 'current' || loadedPeriod === 'previous';
  // Round down to a device pixel so Yoga cannot push the seventh column onto a new row.
  const monthlySquare = Math.max(0, Math.floor((calendarWidth - 6 * monthlyGap) / 7 * PixelRatio.get()) / PixelRatio.get());
  const select = (date: string) => { setSelected(date); setDetail(null); };
  const calendar = groups.map((group) => {
    const first = new Date(localDateStart(group.days[0].date)!);
    const offset = (first.getDay() + 6) % 7;
    const label = first.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
    const cellStyle = monthlyView ? { width: monthlySquare, height: monthlySquare } : null;
    return <View key={group.label} style={[styles.month, monthlyView && { width: calendarWidth }]}>
      <Text style={styles.monthLabel}>{label}</Text>
      <View style={[styles.weekdayRow, monthlyView && { columnGap: monthlyGap }]}>
        {weekdays.map((day, index) => <Text key={index} style={[styles.weekday, monthlyView && { width: monthlySquare }]}>{day}</Text>)}
      </View>
      <View style={[styles.dayGrid, monthlyView && { width: calendarWidth, columnGap: monthlyGap, rowGap: monthlyGap }]}>
        {Array.from({ length: offset }, (_, index) => <View key={`blank-${index}`} style={[styles.dayTarget, cellStyle]} />)}
        {group.days.map((day) => <Pressable key={day.date} accessibilityRole="button" accessibilityLabel={`${formatDate(localDateStart(day.date)!)}: ${formatPaise(day.amountPaise)} spent`}
          accessibilityState={{ selected: selected === day.date }} onPress={() => select(day.date)}
          style={[styles.dayTarget, cellStyle]}>
          <View style={[styles.square, cellStyle, { backgroundColor: heatmapColors[day.intensity] }, selected === day.date && styles.selectedSquare]} />
        </Pressable>)}
      </View>
    </View>;
  });

  return <View style={styles.card}>
    <Text style={styles.heading}>Spending heatmap</Text>
    <Text style={styles.hint}>Daily expenses · tap a square for details</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periods}>
      {heatmapPeriods.map((option) => <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: option.value === period }}
        onPress={() => { if (period === option.value) return; setPeriod(option.value); setSelected(null); setDetail(null); }}
        style={[styles.period, option.value === period && styles.activePeriod]}><Text style={[styles.periodText, option.value === period && styles.activePeriodText]}>{option.label}</Text></Pressable>)}
    </ScrollView>
    {loadedKey !== key && days.length === 0 && !error ? <ActivityIndicator color={colors.primary} /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <View style={styles.calendarViewport} onLayout={(event) => {
      const width = event.nativeEvent.layout.width;
      if (width > 0) setCalendarWidth((previous) => Math.abs(previous - width) > 0.5 ? width : previous);
    }}>
      {monthlyView ? calendarWidth > 6 * monthlyGap ? <View>{calendar}</View> : null
        : <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.months} nestedScrollEnabled>{calendar}</ScrollView>}
    </View>
    <View style={styles.legend}>
      <View style={styles.legendLine}><View style={[styles.legendSquare, { backgroundColor: heatmapColors[0] }]} /><Text style={styles.hint}>No spending</Text></View>
      <View style={styles.legendLine}><Text style={styles.hint}>Less Spending</Text>{heatmapColors.slice(1).map((color) => <View key={color} style={[styles.legendSquare, { backgroundColor: color }]} />)}<Text style={styles.hint}>More Spending</Text></View>
    </View>
    <Text style={styles.scale}>Intensity uses five bands up to the period’s 90th percentile of spending days.</Text>
    {selected && <View style={styles.detail}>
      <Text style={styles.detailTitle}>{formatDate(localDateStart(selected)!)}</Text>
      {detail?.date === selected ? <>
        <Text style={styles.detailText}>Total spent: {formatPaise(detail.amountPaise)}</Text>
        <Text style={styles.detailText}>Expense transactions: {detail.count}</Text>
        <Text style={styles.detailText}>Highest expense: {detail.highest ? `${formatPaise(detail.highest.amountPaise)} · ${detail.highest.category}` : 'None'}</Text>
        {detail.categories.map((category) => <Text key={category.name} style={styles.detailText}>{category.name}: {formatPaise(category.amountPaise)}</Text>)}
        <Pressable accessibilityRole="button" onPress={() => router.navigate({ pathname: '/transactions', params: { spendingDate: selected, filterToken: String(Date.now()) } })} style={styles.link}><Text style={styles.linkText}>View Transactions →</Text></Pressable>
      </> : <ActivityIndicator color={colors.primary} />}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 18, marginTop: 16, overflow: 'hidden' },
  heading: { color: colors.text, fontSize: 18, fontWeight: '800' }, hint: { color: colors.secondaryText, fontSize: 11 },
  periods: { gap: 7, paddingVertical: 13 }, period: { backgroundColor: colors.background, borderRadius: 15, paddingHorizontal: 11, paddingVertical: 9 },
  activePeriod: { backgroundColor: colors.primary }, periodText: { color: colors.secondaryText, fontSize: 11, fontWeight: '700' }, activePeriodText: { color: colors.background },
  calendarViewport: { width: '100%' },
  months: { gap: 3, paddingBottom: 6 }, month: { width: dayPitch * 7 }, monthLabel: { color: colors.text, fontSize: 12, fontWeight: '700', marginBottom: 5 },
  weekdayRow: { flexDirection: 'row' }, weekday: { color: colors.secondaryText, width: dayPitch, textAlign: 'center', fontSize: 10 },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', width: dayPitch * 7 }, dayTarget: { width: dayPitch, height: dayPitch, alignItems: 'center', justifyContent: 'center' },
  square: { width: daySize, height: daySize, borderRadius: 3, borderColor: 'rgba(255, 255, 255, 0.45)', borderWidth: 0.65 },
  selectedSquare: { borderColor: colors.text, borderWidth: 1.75 },
  legend: { gap: 5, marginTop: 8 }, legendLine: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  legendSquare: { width: 13, height: 13, borderRadius: 3, borderColor: 'rgba(255, 255, 255, 0.45)', borderWidth: 0.65 },
  scale: { color: colors.secondaryText, fontSize: 10, lineHeight: 15, marginTop: 7 },
  detail: { borderTopColor: colors.background, borderTopWidth: 1, marginTop: 13, paddingTop: 13, gap: 6 },
  detailTitle: { color: colors.text, fontSize: 15, fontWeight: '800' }, detailText: { color: colors.text, fontSize: 12 },
  link: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' }, linkText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  error: { color: colors.expense, marginVertical: 8 },
});
