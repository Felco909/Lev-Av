/**
 * Периодическая проверка присутствия машин на базе компании — замена Wialon-геозон (Этап 7
 * пересмотрен): вместо геозон, рисуемых в Wialon (нет прав на запись + пользователь явно
 * попросил не использовать геозоны Wialon вообще), используются собственные зоны TMS
 * (CompanyZone, настраивается в /settings). Вся логика — по живым GPS-координатам из
 * Wialon API (getFleetSnapshot), сама проверка "в радиусе" — свой расчёт (lib/geo/distance.ts).
 */
import { prisma } from '@/lib/prisma';
import { getFleetSnapshot } from '@/lib/wialon/client';
import { isWithinRadius } from '@/lib/geo/distance';

export interface CompanyBaseCheckResult {
  checkedVehicles: number;
  vehiclePresenceChanges: Array<{ vehicleId: string; plateNumber: string; from: string; to: 'at_base' | 'away' }>;
  tripTransitions: Array<{ vehicleTripId: string; tripNumber: string; type: 'departed' }>;
  errors: string[];
}

export async function runCompanyBaseCheck(): Promise<CompanyBaseCheckResult> {
  const errors: string[] = [];
  const vehiclePresenceChanges: CompanyBaseCheckResult['vehiclePresenceChanges'] = [];
  const tripTransitions: CompanyBaseCheckResult['tripTransitions'] = [];

  const baseZones = await prisma.companyZone.findMany({ where: { kind: 'base', isActive: true } });
  if (baseZones.length === 0) {
    return { checkedVehicles: 0, vehiclePresenceChanges, tripTransitions, errors };
  }

  const vehicles = await prisma.vehicle.findMany({
    where: { wialonUnitId: { not: null } },
    select: { id: true, plateNumber: true, wialonUnitId: true, atBase: true, atBaseChangedAt: true },
  });
  if (vehicles.length === 0) {
    return { checkedVehicles: 0, vehiclePresenceChanges, tripTransitions, errors };
  }

  let snapshot;
  try {
    snapshot = await getFleetSnapshot();
  } catch (e) {
    errors.push(`Не удалось получить снимок парка Wialon: ${(e as Error).message}`);
    return { checkedVehicles: 0, vehiclePresenceChanges, tripTransitions, errors };
  }
  const posByUnitId = new Map(snapshot.map((s) => [String(s.unitId), s]));

  const activeTrips = await prisma.vehicleTrip.findMany({
    where: { status: 'active', vehicle: { wialonUnitId: { not: null } } },
    select: { id: true, tripNumber: true, vehicleId: true, departureDate: true, returnDate: true, departureConfirmedByGps: true },
  });
  const activeTripByVehicleId = new Map(activeTrips.map((t) => [t.vehicleId, t]));

  const now = new Date();
  let checkedVehicles = 0;

  for (const vehicle of vehicles) {
    const pos = posByUnitId.get(String(vehicle.wialonUnitId));
    if (!pos || pos.lat == null || pos.lon == null) continue;
    checkedVehicles++;

    const matchedZone = baseZones.find((z) => isWithinRadius(pos.lat!, pos.lon!, z.lat, z.lon, z.radiusMeters));
    const nowAtBase = !!matchedZone;
    const wasAtBase = vehicle.atBase;
    // Самая первая проверка по машине (atBaseChangedAt ещё null) — только устанавливаем
    // базовое наблюдение, НЕ триггерим выезд/возврат рейса. Иначе для уже давно идущих
    // активных рейсов первая же проверка (когда машина на дороге, а не на базе) выглядела
    // бы как "только что выехал" и переписала бы реальную дату выезда — этот баг уже был
    // словлен вживую (см. историю чата) и восстановлен из бэкапа, повторяться не должен.
    const isFirstObservation = vehicle.atBaseChangedAt == null;

    if (wasAtBase !== nowAtBase || isFirstObservation) {
      try {
        await prisma.vehicle.update({ where: { id: vehicle.id }, data: { atBase: nowAtBase, atBaseChangedAt: now } });
        if (!isFirstObservation) {
          vehiclePresenceChanges.push({
            vehicleId: vehicle.id,
            plateNumber: vehicle.plateNumber,
            from: wasAtBase == null ? 'unknown' : wasAtBase ? 'at_base' : 'away',
            to: nowAtBase ? 'at_base' : 'away',
          });
        }
      } catch (e) {
        errors.push(`Машина ${vehicle.plateNumber}: не удалось обновить atBase — ${(e as Error).message}`);
      }
    }

    if (isFirstObservation) continue;

    const trip = activeTripByVehicleId.get(vehicle.id);
    if (!trip) continue;

    // Триггерим начало рейса ТОЛЬКО на реально наблюдаемой смене присутствия
    // (wasAtBase -> nowAtBase), а не просто "сейчас machine вне базы" — иначе вторая
    // подряд проверка (когда presence не менялся) снова бы переписывала departureDate
    // на "сейчас" (это и был баг, пойман тестом live, см. историю чата).
    //
    // Автозакрытие рейса по возврату на базу УБРАНО ("Доработка логики рейсов" — финальная
    // архитектура): закрытие теперь только вручную, через POST /api/vehicle-trips/[id]/close
    // (кнопка "Закрыть рейс" — диспетчер сам выбирает дату/время, система один раз берёт
    // живой снимок Wialon и замораживает итоги). Здесь остаётся ТОЛЬКО детект выезда.
    const justDeparted = wasAtBase === true && nowAtBase === false;

    try {
      if (justDeparted && !trip.departureConfirmedByGps) {
        // Первый реальный выезд с базы после создания рейса — фиксируем точный момент.
        await prisma.vehicleTrip.update({
          where: { id: trip.id },
          data: { departureDate: now, departureConfirmedByGps: true, geofenceStatus: 'away', geofenceStatusAt: now, currentZoneId: null },
        });
        await prisma.vehicleTripEvent.create({
          data: { vehicleTripId: trip.id, action: 'status_changed', field: 'geofenceStatus', oldValue: null, newValue: 'away', zoneName: null },
        });
        tripTransitions.push({ vehicleTripId: trip.id, tripNumber: trip.tripNumber, type: 'departed' });
      }
    } catch (e) {
      errors.push(`Рейс ${trip.tripNumber}: ${(e as Error).message}`);
    }
  }

  return { checkedVehicles, vehiclePresenceChanges, tripTransitions, errors };
}
