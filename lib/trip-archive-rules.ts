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

/** Архивация без обязательных полей — только смена статуса; налоговый код сохраняется в записи заявки. */
export function validateTripArchiveTransition(_trip: TripArchiveCheckInput): TripArchiveValidation {
  return { ok: true };
}
