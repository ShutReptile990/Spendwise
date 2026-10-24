export function parseAmountToPaise(raw: string): number | null {
  const value = raw.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;

  const [rupees, fractional = ''] = value.split('.');
  const whole = Number(rupees);
  if (!Number.isSafeInteger(whole) || whole > Math.floor(Number.MAX_SAFE_INTEGER / 100)) return null;

  const paise = whole * 100 + Number(fractional.padEnd(2, '0'));
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

function groupIndianDigits(value: string): string {
  if (value.length <= 3) return value;
  const tail = value.slice(-3);
  const head = value.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${head},${tail}`;
}

export function formatPaise(paise: number): string {
  if (!Number.isSafeInteger(paise)) throw new Error('Amount must be a safe integer number of paise');
  const sign = paise < 0 ? '-' : '';
  const absolute = Math.abs(paise);
  return `${sign}₹${groupIndianDigits(String(Math.floor(absolute / 100)))}.${String(absolute % 100).padStart(2, '0')}`;
}

export function formatSignedAmount(paise: number, type: 'income' | 'expense'): string {
  return `${type === 'income' ? '+' : '-'}${formatPaise(paise)}`;
}

export function formatAmountInput(paise: number): string {
  if (!Number.isSafeInteger(paise) || paise < 0) throw new Error('Invalid amount');
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
}
