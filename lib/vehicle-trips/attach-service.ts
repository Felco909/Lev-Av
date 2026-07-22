import { prisma } from '@/lib/prisma';

/**
 * Сервис привязки заявок собственного транспорта к рейсам машины (Этап 2 миграции
 * на архитектуру "заявка → рейс", см. согласованный план). Рейс создаётся ТОЛЬКО
 * диспетчером вручную — этот файл никогда не создаёт VehicleTrip сам, только
 * привязывает уже существующие заявки к уже существующим открытым рейсам.
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
}

export interface ResolveLinkResult {
  vehicleTripId: string | null;
  error?: string;
}

/**
 * Определяет итоговое значение Trip.vehicleTripId при создании/редактировании заявки:
 * - не собственный транспорт или машина не выбрана → всегда null;
 * - диспетчер явно указал рейс (или явно открепил, null) → используем это значение
 *   после валидации (та же машина, рейс ещё не закрыт);
 * - машина не менялась → существующую связь не трогаем (могла быть выставлена вручную);
 * - машина назначена впервые или изменилась → пробуем автопривязку, только если у
 *   новой машины РОВНО ОДИН открытый рейс; иначе оставляем null — заявка ждёт
 *   привязки (диспетчер выберет вручную, если открытых рейсов несколько, либо
 *   свяжет позже, если рейса ещё нет вовсе).
 */
export async function resolveVehicleTripLink(params: ResolveLinkParams): Promise<ResolveLinkResult> {
  const { tripType, vehicleId, vehicleTripIdProvided, explicitVehicleTripId, previousVehicleId, previousVehicleTripId } = params;

  if (tripType !== 'own_transport' || !vehicleId) {
    return { vehicleTripId: null };
  }

  if (vehicleTripIdProvided) {
    if (!explicitVehicleTripId) {
      // Явное открепление — запрещено, если текущий рейс уже закрыт.
      if (previousVehicleTripId) {
        const prevVt = await prisma.vehicleTrip.findUnique({ where: { id: previousVehicleTripId }, select: { closedAt: true } });
        if (prevVt?.closedAt) {
          return { vehicleTripId: previousVehicleTripId, error: 'Нельзя открепить заявку от уже закрытого рейса' };
        }
      }
      return { vehicleTripId: null };
    }
    const vt = await prisma.vehicleTrip.findUnique({
      where: { id: explicitVehicleTripId },
      select: { vehicleId: true, closedAt: true },
    });
    if (!vt) return { vehicleTripId: previousVehicleTripId ?? null, error: 'Указанный рейс не найден' };
    if (vt.vehicleId !== vehicleId) return { vehicleTripId: previousVehicleTripId ?? null, error: 'Рейс принадлежит другой машине' };
    if (vt.closedAt) return { vehicleTripId: previousVehicleTripId ?? null, error: 'Этот рейс уже закрыт — состав заявок зафиксирован' };
    return { vehicleTripId: explicitVehicleTripId };
  }

  if (previousVehicleId !== undefined && previousVehicleId === vehicleId) {
    return { vehicleTripId: previousVehicleTripId ?? null };
  }

  const openTrips = await prisma.vehicleTrip.findMany({
    where: { vehicleId, status: 'active', closedAt: null },
    select: { id: true },
  });
  if (openTrips.length === 1) return { vehicleTripId: openTrips[0].id };
  return { vehicleTripId: null };
}

export interface UnattachedTripRow {
  id: string;
  tripNumber: string;
  tripDate: string;
  routeFrom: string;
  routeTo: string;
  clientRateAmd: number;
  clientName: string | null;
  vehicleId: string;
}

/** Заявки собственного транспорта с назначенной машиной, но ещё без рейса. */
export async function getUnattachedOwnTrips(vehicleId?: string): Promise<UnattachedTripRow[]> {
  const trips = await prisma.trip.findMany({
    where: {
      tripType: 'own_transport',
      vehicleId: vehicleId ? vehicleId : { not: null },
      vehicleTripId: null,
    },
    select: {
      id: true, tripNumber: true, tripDate: true, routeFrom: true, routeTo: true,
      clientRateAmd: true, clientRate: true, vehicleId: true,
      client: { select: { name: true } },
    },
    orderBy: { tripDate: 'desc' },
  });
  return trips.map((t) => ({
    id: t.id,
    tripNumber: t.tripNumber,
    tripDate: t.tripDate.toISOString(),
    routeFrom: t.routeFrom,
    routeTo: t.routeTo,
    clientRateAmd: Number(t.clientRateAmd ?? t.clientRate ?? 0),
    clientName: t.client?.name ?? null,
    vehicleId: t.vehicleId as string,
  }));
}

export interface BulkAttachResult {
  attached: string[];
  skipped: Array<{ tripId: string; reason: string }>;
}

/** Массовая привязка нескольких заявок к открытому рейсу (карточка рейса, предложение при создании). */
export async function attachTripsToVehicleTrip(vehicleTripId: string, tripIds: string[]): Promise<BulkAttachResult> {
  const vt = await prisma.vehicleTrip.findUnique({ where: { id: vehicleTripId }, select: { vehicleId: true, closedAt: true } });
  if (!vt) return { attached: [], skipped: tripIds.map((id) => ({ tripId: id, reason: 'Рейс не найден' })) };
  if (vt.closedAt) return { attached: [], skipped: tripIds.map((id) => ({ tripId: id, reason: 'Рейс уже закрыт' })) };

  const trips = await prisma.trip.findMany({
    where: { id: { in: tripIds } },
    select: { id: true, vehicleId: true, vehicleTripId: true },
  });
  const attached: string[] = [];
  const skipped: Array<{ tripId: string; reason: string }> = [];
  for (const t of trips) {
    if (t.vehicleId !== vt.vehicleId) {
      skipped.push({ tripId: t.id, reason: 'Заявка другой машины' });
      continue;
    }
    attached.push(t.id);
  }
  if (attached.length > 0) {
    await prisma.trip.updateMany({ where: { id: { in: attached } }, data: { vehicleTripId } });
  }
  return { attached, skipped };
}
