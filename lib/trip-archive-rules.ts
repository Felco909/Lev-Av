import { canonicalWorkflowTripStatus } from '@/lib/utils';

export type TripArchiveCheckInput = {
  status: string | null | undefined;
  taxCode?: string | null;
  invoiceDocNumber?: string | null;
  actDocNumber?: string | null;
  invoiceDocDate?: Date | string | null;
  actDocDate?: Date | string | null;
};

export type TripArchiveValidation =
  | { ok: true }
  | { ok: false; message: string; missing: string[] };

/** Финансово закрыта, но ещё не архив. */
export function isFinanciallyCompletedStatus(status: string | null | undefined): boolean {
  return canonicalWorkflowTripStatus(status) === 'completed';
}

export function isArchivedStatus(status: string | null | undefined): boolean {
  return String(status ?? '').trim().toLowerCase() === 'archived';
}

/** Архивация требует статуса «Оплачен / Завершён», заполненного налогового кода и номеров счёта/акта. */
export function validateTripArchiveTransition(trip: TripArchiveCheckInput): TripArchiveValidation {
  if (!isFinanciallyCompletedStatus(trip.status)) {
    return {
      ok: false,
      message: 'Архивировать можно только заявку в статусе «Оплачен / Завершён».',
      missing: ['Статус'],
    };
  }

  const missing: string[] = [];
  if (!String(trip.taxCode ?? '').trim()) missing.push('Налоговый код');
  if (!String(trip.invoiceDocNumber ?? '').trim()) missing.push('Номер счёта');
  if (!String(trip.actDocNumber ?? '').trim()) missing.push('Номер акта');
  if (missing.length > 0) {
    return {
      ok: false,
      message: `Нельзя отправить в архив — не заполнено: ${missing.join(', ')}.`,
      missing,
    };
  }
  return { ok: true };
}
