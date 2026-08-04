import { STATUS_ORDER, canonicalWorkflowTripStatus } from '@/lib/utils';

/**
 * Ключ секции списка заявок на странице.
 */
export type TripListSectionKey =
  | 'new'
  | 'in_progress'
  | 'unloaded'
  | 'awaiting_payment'
  | 'sverka'
  | 'completed'
  | 'archived';

/** Ранг для сортировки: меньше — выше в списке (индекс в STATUS_ORDER). */
export function tripStatusGroupRank(status: string | null | undefined): number {
  const c = canonicalWorkflowTripStatus(status);
  if (!c) return STATUS_ORDER.indexOf('completed');
  const idx = (STATUS_ORDER as readonly string[]).indexOf(c);
  if (idx >= 0) return idx;
  return STATUS_ORDER.indexOf('completed');
}

/**
 * В какую секцию списка попадает заявка по полю trip.status.
 */
export function tripListSectionKey(status: string | null | undefined): TripListSectionKey {
  const s = canonicalWorkflowTripStatus(status);
  if (s === 'new') return 'new';
  if (s === 'in_progress') return 'in_progress';
  if (s === 'unloaded') return 'unloaded';
  if (s === 'awaiting_payment') return 'awaiting_payment';
  if (s === 'sverka') return 'sverka';
  if (s === 'archived') return 'archived';
  return 'completed';
}

