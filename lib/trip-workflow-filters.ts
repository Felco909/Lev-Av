import { canonicalWorkflowTripStatus } from '@/lib/utils';

/** Статусы, не участвующие в просрочке / напоминаниях по оплате (архив и «в пути»). */
export const PAYMENT_REMINDER_EXCLUDED_STATUSES = [
  'archived',
  'new',
  'in_progress',
  'cancelled',
] as const;

/** Статусы, исключаемые из активной дебиторки / кредиторки. */
export const ACTIVE_RECEIVABLE_EXCLUDED_STATUSES = [
  'archived',
  'completed',
  'paid',
  'new',
  'in_progress',
  'unloaded',
  'cancelled',
] as const;

/** «На оплату» — дебиторка, срок и просрочка. */
export const AWAITING_PAYMENT_STATUSES = ['awaiting_payment'] as const;

/** Долги в «Долги» и на главном экране: после разгрузки и до архива (не «в пути»). */
export const DEBT_ACCOUNTING_STATUSES = [
  'unloaded',
  'awaiting_payment',
  'sverka',
  'completed',
  'paid',
] as const;

/** «Разгружен» — бухгалтерия готовит документы. */
export const UNLOADED_ACCOUNTING_STATUSES = ['unloaded'] as const;

/** «Оплачен / завершён» и legacy paid. */
export const COMPLETED_DISPLAY_STATUSES = ['completed', 'paid'] as const;

export const TRIP_STATUS_LABELS_RU: Record<string, string> = {
  new: 'Новая',
  in_progress: 'В пути',
  unloaded: 'Разгружен',
  awaiting_payment: 'На оплату',
  sverka: 'Сверка',
  completed: 'Оплачен / Завершён',
  paid: 'Оплачен / Завершён',
  archived: 'Архив',
  cancelled: 'Отменена',
};

export function prismaPaymentReminderExcludedStatuses(): string[] {
  return [...PAYMENT_REMINDER_EXCLUDED_STATUSES];
}

export function prismaActiveReceivableExcludedStatuses(): string[] {
  return [...ACTIVE_RECEIVABLE_EXCLUDED_STATUSES];
}

export function isArchivedWorkflowStatus(status: string | null | undefined): boolean {
  return String(status ?? '').trim().toLowerCase() === 'archived';
}

export function isFinanciallyClosedWorkflowStatus(status: string | null | undefined): boolean {
  const canonical = canonicalWorkflowTripStatus(status);
  return canonical === 'completed' || canonical === 'archived';
}

export function isPaymentReceivableWorkflowStatus(status: string | null | undefined): boolean {
  return String(status ?? '').trim() === 'awaiting_payment';
}

export function isDebtAccountingWorkflowStatus(status: string | null | undefined): boolean {
  const st = String(status ?? '').trim().toLowerCase();
  return (DEBT_ACCOUNTING_STATUSES as readonly string[]).includes(st);
}

/** Дебиторка клиента в разделе «Долги» и KPI главного экрана. */
export function isActiveReceivableWorkflowStatus(status: string | null | undefined): boolean {
  return isDebtAccountingWorkflowStatus(status);
}

/** Кредиторка перевозчику — те же статусы, что и для клиента. */
export function isActiveCarrierPayableWorkflowStatus(status: string | null | undefined): boolean {
  return isDebtAccountingWorkflowStatus(status);
}

export function withDebtAccountingWhere(
  base: Record<string, unknown> = {},
): Record<string, unknown> {
  return mergeTripWhere(base, { status: { in: [...DEBT_ACCOUNTING_STATUSES] } });
}

export function withCarrierPayableWhere(
  base: Record<string, unknown> = {},
): Record<string, unknown> {
  return withDebtAccountingWhere(base);
}

export function buildTripStatusWhereClause(
  filterStatus: string | null | undefined,
  showArchived: boolean,
): Record<string, unknown> {
  const status = String(filterStatus ?? '').trim();
  if (status) {
    if (status === 'completed') return { status: { in: ['completed', 'paid'] } };
    return { status };
  }
  if (!showArchived) return { status: { not: 'archived' } };
  return {};
}

export function mergeTripWhere(
  base: Record<string, unknown>,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return { ...base, ...extra };
}

export function withArchivedExcludedWhere(
  base: Record<string, unknown> = {},
): Record<string, unknown> {
  return mergeTripWhere(base, { status: { not: 'archived' } });
}

export function withActiveReceivableWhere(
  base: Record<string, unknown> = {},
): Record<string, unknown> {
  return withDebtAccountingWhere(base);
}
