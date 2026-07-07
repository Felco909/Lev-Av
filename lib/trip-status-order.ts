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

/** Порядок секций списка заявок: совпадает с STATUS_ORDER. */
export const TRIP_LIST_SECTION_KEYS: readonly TripListSectionKey[] = (() => {
  const seen = new Set<TripListSectionKey>();
  const keys: TripListSectionKey[] = [];
  for (const workflow of STATUS_ORDER) {
    const sec = tripListSectionKey(workflow);
    if (!seen.has(sec)) {
      seen.add(sec);
      keys.push(sec);
    }
  }
  return keys;
})();

/** Сначала статус по STATUS_ORDER, внутри статуса — дата, затем стабильно по id. */
export function compareTripsForList(
  a: any,
  b: any,
  sortBy: 'tripDate' | 'createdAt',
  sortDir: 'asc' | 'desc',
): number {
  const ga = tripStatusGroupRank(a?.status);
  const gb = tripStatusGroupRank(b?.status);
  if (ga !== gb) return ga - gb;
  const ad = sortBy === 'createdAt' ? (a?.createdAt ? new Date(a.createdAt).getTime() : 0) : (a?.tripDate ? new Date(a.tripDate).getTime() : 0);
  const bd = sortBy === 'createdAt' ? (b?.createdAt ? new Date(b.createdAt).getTime() : 0) : (b?.tripDate ? new Date(b.tripDate).getTime() : 0);
  const diff = bd - ad;
  const byDate = sortDir === 'asc' ? -diff : diff;
  if (byDate !== 0) return byDate;
  return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
}
