import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

export function useCurrentMonth() {
  const [today, setToday] = useState(() => new Date());
  const year = today.getFullYear();
  const monthNumber = today.getMonth() + 1;
  const month = useMemo(() => ({ year, month: monthNumber }), [year, monthNumber]);
  useEffect(() => {
    const update = () => setToday(new Date());
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    const timer = setTimeout(update, nextMonth - now.getTime() + 100);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') update(); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [today]);
  return month;
}
