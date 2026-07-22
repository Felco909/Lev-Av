import { prisma } from '@/lib/prisma';

/**
 * Проверка целостности данных новой архитектуры "заявка → рейс" (см. согласованный
 * план миграции). Ничего не исправляет и не блокирует — только находит и описывает
 * нарушения для диагностического раздела администратора.
 */

export type IntegrityViolationType =
  | 'trip_no_vehicle'            // собственный транспорт без назначенной машины
  | 'trip_awaiting_link'         // машина назначена, но vehicleTripId ещё не проставлен
  | 'trip_vehicle_mismatch'      // Trip.vehicleId не совпадает с vehicleId рейса, к которому он привязан
  | 'multiple_open_vehicle_trips'; // у машины больше одного открытого рейса одновременно

export type IntegritySeverity = 'info' | 'warning' | 'error';

export interface IntegrityViolation {
  type: IntegrityViolationType;
  severity: IntegritySeverity;
  message: string;
  tripId?: string;
  tripNumber?: string;
  vehicleId?: string;
  vehicleTripId?: string;
}

export async function checkOwnFleetDataIntegrity(): Promise<IntegrityViolation[]> {
  const violations: IntegrityViolation[] = [];

  // 1) Собственный транспорт без машины — заявка ещё не готова к привязке рейса.
  const noVehicle = await prisma.trip.findMany({
    where: { tripType: 'own_transport', vehicleId: null },
    select: { id: true, tripNumber: true },
  });
  for (const t of noVehicle) {
    violations.push({
      type: 'trip_no_vehicle',
      severity: 'warning',
      message: `Заявка №${t.tripNumber} — собственный транспорт без назначенной машины`,
      tripId: t.id,
      tripNumber: t.tripNumber,
    });
  }

  // 2) Машина назначена, рейс — нет ("ожидает привязки", ожидаемое переходное
  //    состояние, см. архитектуру — не ошибка, но должно быть видно администратору).
  const noLink = await prisma.trip.findMany({
    where: { tripType: 'own_transport', vehicleId: { not: null }, vehicleTripId: null },
    select: { id: true, tripNumber: true, vehicleId: true },
  });
  for (const t of noLink) {
    violations.push({
      type: 'trip_awaiting_link',
      severity: 'info',
      message: `Заявка №${t.tripNumber} ожидает привязки к рейсу`,
      tripId: t.id,
      tripNumber: t.tripNumber,
      vehicleId: t.vehicleId ?? undefined,
    });
  }

  // 3) Заявка привязана к рейсу ДРУГОЙ машины, чем указано в самой заявке —
  //    настоящая порча данных, при корректной работе сервиса привязки не должна
  //    возникать никогда.
  const linked = await prisma.trip.findMany({
    where: { vehicleTripId: { not: null } },
    select: {
      id: true,
      tripNumber: true,
      vehicleId: true,
      vehicleTripId: true,
      vehicleTrip: { select: { vehicleId: true } },
    },
  });
  for (const t of linked) {
    if (t.vehicleTrip && t.vehicleId !== t.vehicleTrip.vehicleId) {
      violations.push({
        type: 'trip_vehicle_mismatch',
        severity: 'error',
        message: `Заявка №${t.tripNumber} привязана к рейсу машины, отличной от машины заявки`,
        tripId: t.id,
        tripNumber: t.tripNumber,
        vehicleId: t.vehicleId ?? undefined,
        vehicleTripId: t.vehicleTripId ?? undefined,
      });
    }
  }

  // 4) Несколько открытых рейсов одной машины одновременно — не запрещено само по
  //    себе, но делает автопривязку неоднозначной (см. архитектуру автопривязки),
  //    стоит показать администратору как аномалию.
  const openTrips = await prisma.vehicleTrip.findMany({
    where: { status: 'active', closedAt: null },
    select: { id: true, tripNumber: true, vehicleId: true },
  });
  const byVehicle = new Map<string, typeof openTrips>();
  for (const vt of openTrips) {
    const arr = byVehicle.get(vt.vehicleId) ?? [];
    arr.push(vt);
    byVehicle.set(vt.vehicleId, arr);
  }
  for (const [vehicleId, trips] of byVehicle) {
    if (trips.length > 1) {
      violations.push({
        type: 'multiple_open_vehicle_trips',
        severity: 'warning',
        message: `У машины несколько открытых рейсов одновременно (№${trips.map((t) => t.tripNumber).join(', №')})`,
        vehicleId,
      });
    }
  }

  return violations;
}
