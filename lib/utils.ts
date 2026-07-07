import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(val: number | null | undefined): string {
  const n = Math.round(Number(val ?? 0));
  return `${n.toLocaleString('ru-RU')} \u058F`;
}

export function formatCurrencyRaw(val: number | null | undefined, currency?: string): string {
  const n = Math.round(Number(val ?? 0));
  const SYMBOLS: Record<string, string> = { AMD: '\u058F', USD: '$', EUR: '\u20AC', RUB: '\u20BD', GEL: '\u20BE' };
  const sym = SYMBOLS[currency || 'AMD'] || (currency || '\u058F');
  return `${n.toLocaleString('ru-RU')} ${sym}`;
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d));
  } catch {
    return '—';
  }
}

export const STATUS_MAP: Record<string, { label: string; color: string }> = {
  new: { label: '\u041D\u043E\u0432\u0430\u044F', color: 'bg-blue-100 text-blue-700' },
  in_progress: { label: '\u0412 \u043F\u0443\u0442\u0438', color: 'bg-amber-100 text-amber-700' },
  unloaded: { label: '\u0420\u0430\u0437\u0433\u0440\u0443\u0436\u0435\u043D', color: 'bg-orange-100 text-orange-700' },
  awaiting_payment: { label: '\u041D\u0430 \u043E\u043F\u043B\u0430\u0442\u0443', color: 'bg-purple-100 text-purple-700' },
  sverka: { label: '\u0421\u0432\u0435\u0440\u043a\u0430', color: 'bg-teal-100 text-teal-700' },
  paid: { label: '\u041E\u043F\u043B\u0430\u0447\u0435\u043D', color: 'bg-emerald-100 text-emerald-700' }, // legacy — kept for display only
  completed: { label: '\u0417\u0430\u0432\u0435\u0440\u0448\u0451\u043D', color: 'bg-green-100 text-green-700' },
  archived: { label: '\u0410\u0440\u0445\u0438\u0432', color: 'bg-slate-100 text-slate-500' },
};

// Порядок статусов для кнопки "Следующий статус" — "paid" removed (tracked via clientPaymentStatus)
export const STATUS_ORDER = ['new', 'in_progress', 'unloaded', 'awaiting_payment', 'sverka', 'completed'];

export const TRIP_TYPE_MAP: Record<string, string> = {
  own_transport: 'Собственные',
  expedition: 'Экспедиция',
};

export const EXPENSE_TYPE_MAP: Record<string, string> = {
  fuel: 'Топливо (дизель)',
  salary: 'Зарплата водителя',
  per_diem: 'Суточные / дорожные',
  toll: 'Платные дороги',
  ferry: 'Паром',
  repair: 'Ремонт',
  parking: 'Стоянка',
  downtime: 'Простой',
  insurance: 'Страховка',
  other: 'Прочее',
};

// Fleet (standalone) expense types — not tied to trips
export const FLEET_EXPENSE_TYPE_MAP: Record<string, string> = {
  salary: 'Зарплата водителю',
  fuel: 'Топливо',
  per_diem: 'Суточные',
  other: 'Прочее',
};

// Expense report grouping for own_transport breakdown
export const EXPENSE_REPORT_GROUPS: Record<string, { label: string; types: string[] }> = {
  salary: { label: 'Зарплата', types: ['salary'] },
  fuel: { label: 'Топливо', types: ['fuel'] },
  per_diem: { label: 'Суточные / дорожные', types: ['per_diem'] },
  other: { label: 'Прочие расходы', types: ['toll', 'ferry', 'repair', 'parking', 'insurance', 'other'] },
};

// Maps legacy/null statuses to canonical workflow status strings.
// 'paid' was removed from the workflow and is treated as 'completed'.
export function canonicalWorkflowTripStatus(status: string | null | undefined): string {
  const s = String(status ?? '').trim().toLowerCase();
  if (!s) return 'new';
  if (s === 'paid') return 'completed';
  return s;
}

// CSS class for exchange-rate and rate input fields in forms.
export const RATE_INPUT_CLASS =
  'border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none';

// Parses a rate/exchange-rate string (comma or dot decimal) to a number.
// Returns 0 for empty or invalid input (callers use `|| 1` as the safe default).
export function parseRateInput(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  const normalized = String(value).replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
}
