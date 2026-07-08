import { canonicalWorkflowTripStatus } from '@/lib/utils';

export type TripArchiveCheckInput = {
  status: string | null | undefined;
  taxCode?: string | null;
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

/** Архивация требует статуса «Оплачен / Завершён» и заполненного налогового кода. */
export function validateTripArchiveTransition(trip: TripArchiveCheckInput): TripArchiveValidation {
  if (!isFinanciallyCompletedStatus(trip.status)) {
    return {
      ok: false,
      message: 'Архивировать можно только заявку в статусе «Оплачен / Завершён».',
      missing: ['Статус'],
    };
  }

  if (!String(trip.taxCode ?? '').trim()) {
    return {
      ok: false,
      message: 'Нельзя отправить в архив — не заполнено: Налоговый код.',
      missing: ['Налоговый код'],
    };
  }
  return { ok: true };
}
