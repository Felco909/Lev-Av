/**
 * Чистая функция расчёта статуса ТО для пары машина×регламент — без обращений к БД
 * (данные передаются вызывающим кодом, см. app/api/maintenance/status/route.ts).
 * Единый порог 15% интервала на обеих осях (км/время) — берётся наиболее срочный статус.
 */

export type MaintenanceStatusLevel = 'ok' | 'soon' | 'overdue';

const SOON_THRESHOLD_RATIO = 0.15;
const DAYS_PER_MONTH = 30; // приближение для перевода monthsInterval в дни

export interface MaintenanceStatusInput {
  /** Текущий пробег машины (Vehicle.currentMileage) */
  currentMileage: number | null;
  /** Пробег на момент последнего планового ТО по этому регламенту (ServiceRecord.mileage) */
  lastServiceMileage: number | null;
  /** Дата последнего планового ТО по этому регламенту (ServiceRecord.date) */
  lastServiceDate: Date | null;
  /** ServiceRegulation.mileageInterval */
  mileageInterval: number | null;
  /** ServiceRegulation.monthsInterval */
  monthsInterval: number | null;
  /** Для тестируемости — по умолчанию new Date() */
  now?: Date;
}

export interface MaintenanceStatusResult {
  status: MaintenanceStatusLevel;
  remainingKm: number | null;
  remainingDays: number | null;
  nextMileage: number | null;
  nextDate: Date | null;
}

function statusFromRemaining(remaining: number, fullInterval: number): MaintenanceStatusLevel {
  if (remaining <= 0) return 'overdue';
  if (fullInterval <= 0) return 'ok';
  return remaining <= fullInterval * SOON_THRESHOLD_RATIO ? 'soon' : 'ok';
}

const STATUS_RANK: Record<MaintenanceStatusLevel, number> = { ok: 0, soon: 1, overdue: 2 };

function worstOf(statuses: Array<MaintenanceStatusLevel | null>): MaintenanceStatusLevel {
  let worst: MaintenanceStatusLevel = 'ok';
  for (const s of statuses) {
    if (s && STATUS_RANK[s] > STATUS_RANK[worst]) worst = s;
  }
  return worst;
}

export function calculateMaintenanceStatus(input: MaintenanceStatusInput): MaintenanceStatusResult {
  const now = input.now ?? new Date();

  // Никогда не обслуживалась по этому регламенту.
  if (input.lastServiceMileage == null && input.lastServiceDate == null) {
    return {
      status: input.currentMileage ? 'overdue' : 'soon',
      remainingKm: null,
      remainingDays: null,
      nextMileage: null,
      nextDate: null,
    };
  }

  let nextMileage: number | null = null;
  let remainingKm: number | null = null;
  if (input.mileageInterval && input.lastServiceMileage != null) {
    nextMileage = input.lastServiceMileage + input.mileageInterval;
    if (input.currentMileage != null) {
      remainingKm = nextMileage - input.currentMileage;
    }
  }

  let nextDate: Date | null = null;
  let remainingDays: number | null = null;
  if (input.monthsInterval && input.lastServiceDate) {
    nextDate = new Date(input.lastServiceDate);
    nextDate.setMonth(nextDate.getMonth() + input.monthsInterval);
    remainingDays = Math.floor((nextDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  const kmStatus =
    remainingKm != null && input.mileageInterval ? statusFromRemaining(remainingKm, input.mileageInterval) : null;
  const dayStatus =
    remainingDays != null && input.monthsInterval
      ? statusFromRemaining(remainingDays, input.monthsInterval * DAYS_PER_MONTH)
      : null;

  return {
    status: worstOf([kmStatus, dayStatus]),
    remainingKm,
    remainingDays,
    nextMileage,
    nextDate,
  };
}
