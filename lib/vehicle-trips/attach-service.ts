import { prisma } from '@/lib/prisma';
import { recordTripHistory } from '@/lib/trip-history';

/**
 * Сервис привязки заявок собственного транспорта к рейсам машины (архитектура
 * "заявка → рейс"). Рейс создаётся ТОЛЬКО диспетчером вручную — этот файл никогда не
 * создаёт VehicleTrip сам, только привязывает уже существующие заявки к уже существующим
 * рейсам.
 *
 * Переработка модуля "Рейсы" (2026-07-23): рейс полностью редактируем независимо от
 * статуса (В работе/Завершён/Архив) — прежняя защита "нельзя менять состав уже закрытого
 * рейса" снята по явному решению пользователя. Предупреждения на фронтенде (перенос из
 * другого рейса, продвинутый статус заявки) остаются — это просто confirm(), не запрет.
 */

export interface ResolveLinkParams {
  tripType: string;
  vehicleId: string | null;
  /** true, если тело запроса вообще содержало ключ vehicleTripId (в отличие от undefined). */
  vehicleTripIdProvided: boolean;
  /** Значение из тела запроса — конкретный id (явный выбор/перенос) или null (явное открепление). */
  explicitVehicleTripId?: string | null;
  /** Машина заявки ДО сохранения (для PUT) — undefined для создания новой заявки. */
  previousVehicleId?: string | null;
  previousVehicleTripId?: string | null;
  /** Водитель, назначенный на саму заявку — для не-блокирующей проверки рассинхронизации
   *  с водителем рейса (TMS-AUDIT-0017). Не путать с previousVehicleId — это про машину. */
  driverId?: string | null;
}

export interface ResolveLinkResult {
  vehicleTripId: string | null;
  error?: string;
  /** Не блокирует привязку — водитель заявки и водитель рейса не совпадают (например,
   *  реальная подмена водителя в рейсе — легитимный сценарий, см. TMS-AUDIT-0017). */
  warning?: string;
}

/**
 * Определяет итоговое значение Trip.vehicleTripId при создании/редактировании заявки:
 * - не собственный транспорт или машина не выбрана → всегда null;
 * - диспетчер явно указал рейс (или явно открепил, null) → используем это значение
 *   после валидации (та же машина);
 * - машина не менялась → существующую связь не трогаем (могла быть выставлена вручную);
 * - машина назначена впервые или изменилась → пробуем автопривязку, только если у
 *   новой машины РОВНО ОДИН рейс в работе; иначе оставляем null — заявка ждёт
 *   привязки (диспетчер выберет вручную, если рейсов несколько, либо свяжет позже,
 *   если рейса ещё нет вовсе).
 */
/** Не блокирует ничего — только читаемое предупреждение, если у заявки и у рейса указаны
 *  РАЗНЫЕ водители (см. TMS-AUDIT-0017). Пустой driverId с любой стороны — не расхождение,
 *  это норма (заявка/рейс без назначенного водителя). */
async function describeDriverMismatch(tripDriverId: string | null | undefined, vehicleTripDriverId: string | null | undefined): Promise<string | undefined> {
  if (!tripDriverId || !vehicleTripDriverId || tripDriverId === vehicleTripDriverId) return undefined;
  const drivers = await prisma.driver.findMany({
    where: { id: { in: [tripDriverId, vehicleTripDriverId] } },
    select: { id: true, fullName: true },
  });
  const nameOf = (id: string) => drivers.find((d) => d.id === id)?.fullName ?? id;
  return `Водитель заявки (${nameOf(tripDriverId)}) не совпадает с водителем рейса (${nameOf(vehicleTripDriverId)}).`;
}

export async function resolveVehicleTripLink(params: ResolveLinkParams): Promise<ResolveLinkResult> {
  const { tripType, vehicleId, vehicleTripIdProvided, explicitVehicleTripId, previousVehicleId, previousVehicleTripId, driverId } = params;

  if (tripType !== 'own_transport' || !vehicleId) {
    return { vehicleTripId: null };
  }

  if (vehicleTripIdProvided) {
    if (!explicitVehicleTripId) {
      return { vehicleTripId: null };
    }
    const vt = await prisma.vehicleTrip.findUnique({
      where: { id: explicitVehicleTripId },
      select: { vehicleId: true, driverId: true },
    });
    if (!vt) return { vehicleTripId: previousVehicleTripId ?? null, error: 'Указанный рейс не найден' };
    if (vt.vehicleId !== vehicleId) return { vehicleTripId: previousVehicleTripId ?? null, error: 'Рейс принадлежит другой машине' };
    return { vehicleTripId: explicitVehicleTripId, warning: await describeDriverMismatch(driverId, vt.driverId) };
  }

  if (previousVehicleId !== undefined && previousVehicleId === vehicleId) {
    if (!previousVehicleTripId) return { vehicleTripId: null };
    const vt = await prisma.vehicleTrip.findUnique({ where: { id: previousVehicleTripId }, select: { driverId: true } });
    return { vehicleTripId: previousVehicleTripId, warning: await describeDriverMismatch(driverId, vt?.driverId) };
  }

  const openTrips = await prisma.vehicleTrip.findMany({
    where: { vehicleId, status: 'active' },
    select: { id: true, driverId: true },
  });
  if (openTrips.length === 1) return { vehicleTripId: openTrips[0].id, warning: await describeDriverMismatch(driverId, openTrips[0].driverId) };
  return { vehicleTripId: null };
}

/** Заявка в статусе, близком к финансовому завершению (см. STATUS_ORDER в lib/utils.ts) —
 *  перенос между рейсами не трогает суммы/статус самой заявки, но диспетчера стоит явно
 *  предупредить, что меняется распределение дохода машины между рейсами задним числом. */
export const ADVANCED_TRIP_STATUSES = new Set(['awaiting_payment', 'sverka', 'completed']);

export interface UnattachedTripRow {
  id: string;
  tripNumber: string;
  tripDate: string;
  routeFrom: string;
  routeTo: string;
  clientRateAmd: number;
  clientName: string | null;
  vehicleId: string;
  status: string;
  /** Номер рейса, к которому заявка уже привязана — только для getAvailableTripsForAttach,
   *  у по-настоящему непривязанных заявок всегда null. */
  currentVehicleTripNumber?: string | null;
}

function toRow(t: any): UnattachedTripRow {
  return {
    id: t.id,
    tripNumber: t.tripNumber,
    tripDate: t.tripDate.toISOString(),
    routeFrom: t.routeFrom,
    routeTo: t.routeTo,
    clientRateAmd: Number(t.clientRateAmd ?? t.clientRate ?? 0),
    clientName: t.client?.name ?? null,
    vehicleId: t.vehicleId as string,
    status: t.status,
    currentVehicleTripNumber: t.vehicleTrip?.tripNumber ?? null,
  };
}

const TRIP_SELECT_FOR_ATTACH = {
  id: true, tripNumber: true, tripDate: true, routeFrom: true, routeTo: true,
  clientRateAmd: true, clientRate: true, vehicleId: true, status: true,
  client: { select: { name: true } },
  vehicleTrip: { select: { tripNumber: true } },
} as const;

/** Заявки собственного транспорта с назначенной машиной, но ещё без рейса вообще.
 *  Отменённые (Этап 4 аудита) не предлагаются — привязывать их к рейсу нет смысла. */
export async function getUnattachedOwnTrips(vehicleId?: string): Promise<UnattachedTripRow[]> {
  const trips = await prisma.trip.findMany({
    where: {
      tripType: 'own_transport',
      vehicleId: vehicleId ? vehicleId : { not: null },
      vehicleTripId: null,
      NOT: { status: 'cancelled' },
    },
    select: TRIP_SELECT_FOR_ATTACH,
    orderBy: { tripDate: 'desc' },
  });
  return trips.map(toRow);
}

/**
 * Заявки, которые можно привязать к конкретному рейсу через "Добавить заявки" — не
 * только по-настоящему непривязанные, но и уже привязанные к ЛЮБОМУ другому рейсу той же
 * машины (перенос, независимо от его статуса — рейс полностью редактируем всегда).
 */
export async function getAvailableTripsForAttach(vehicleId: string, excludeVehicleTripId: string): Promise<UnattachedTripRow[]> {
  const trips = await prisma.trip.findMany({
    where: {
      tripType: 'own_transport',
      vehicleId,
      OR: [
        { vehicleTripId: null },
        { vehicleTripId: { not: excludeVehicleTripId } },
      ],
      // Отменённые (Этап 4 аудита) не предлагаются — привязывать их к рейсу нет смысла.
      NOT: { status: 'cancelled' },
    },
    select: TRIP_SELECT_FOR_ATTACH,
    orderBy: { tripDate: 'desc' },
  });
  return trips.map(toRow);
}

export interface BulkAttachResult {
  attached: string[];
  skipped: Array<{ tripId: string; reason: string }>;
  /** Не блокирует привязку — см. describeDriverMismatch/TMS-AUDIT-0017. */
  warnings: Array<{ tripId: string; tripNumber: string; reason: string }>;
}

/**
 * Массовая привязка нескольких заявок к рейсу (карточка рейса, предложение при создании).
 * Заявка, уже привязанная к другому рейсу той же машины (любого статуса), переносится.
 */
export async function attachTripsToVehicleTrip(vehicleTripId: string, tripIds: string[]): Promise<BulkAttachResult> {
  const vt = await prisma.vehicleTrip.findUnique({ where: { id: vehicleTripId }, select: { vehicleId: true, driverId: true } });
  if (!vt) return { attached: [], skipped: tripIds.map((id) => ({ tripId: id, reason: 'Рейс не найден' })), warnings: [] };

  const trips = await prisma.trip.findMany({
    where: { id: { in: tripIds } },
    select: { id: true, tripNumber: true, vehicleId: true, driverId: true },
  });
  const attached: string[] = [];
  const skipped: Array<{ tripId: string; reason: string }> = [];
  const warnings: Array<{ tripId: string; tripNumber: string; reason: string }> = [];
  for (const t of trips) {
    if (t.vehicleId !== vt.vehicleId) {
      skipped.push({ tripId: t.id, reason: 'Заявка другой машины' });
      continue;
    }
    attached.push(t.id);
    const mismatch = await describeDriverMismatch(t.driverId, vt.driverId);
    if (mismatch) warnings.push({ tripId: t.id, tripNumber: t.tripNumber, reason: mismatch });
  }
  if (attached.length > 0) {
    await prisma.trip.updateMany({ where: { id: { in: attached } }, data: { vehicleTripId } });
  }
  return { attached, skipped, warnings };
}

/**
 * Открепить заявку от её текущего рейса (без переноса в другой — "Заявки: ...
 * add/remove/replace", переработка модуля "Рейсы", 2026-07-23). Заявка возвращается
 * в "Ожидают привязки". Не трогает ничего, кроме самой связи — сумма/статус заявки
 * не меняются, доход старого рейса пересчитывается автоматически (уже не включает её).
 */
/**
 * userId/userName — для записи в TripHistory (аудит, средний приоритет: раньше отвязка не
 * оставляла следа, кто и когда это сделал — в отличие от закрытия рейса, которое логируется
 * в VehicleTripEvent).
 */
export async function detachTripFromVehicleTrip(tripId: string, userId: string | null = null, userName: string | null = null): Promise<void> {
  const before = await prisma.trip.findUnique({ where: { id: tripId }, select: { vehicleTripId: true } });
  await prisma.trip.update({ where: { id: tripId }, data: { vehicleTripId: null } });
  await recordTripHistory(tripId, 'vehicle_trip_detached', userId, userName, [
    { field: 'vehicleTripId', oldValue: before?.vehicleTripId ?? null, newValue: null },
  ]);
}
