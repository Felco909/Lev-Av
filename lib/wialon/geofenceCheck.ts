/**
 * Проверка геозон для всех активных рейсов (Этап 7) — вызывается по расписанию (каждые 5 мин,
 * scripts/wialon-geofence-check.ts) и вручную из API. Определяет, в какой зоне (если есть)
 * сейчас находится машина, сравнивает с прошлой проверкой, меняет geofenceStatus по правилам
 * lib/geo/geofenceStateMachine.ts и пишет событие в VehicleTripEvent.
 */
import { prisma } from '@/lib/prisma';
import { getZones, getFleetSnapshot } from '@/lib/wialon/client';
import { isPointInZone } from '@/lib/geo/pointInZone';
import {
  onZoneEnter, onZoneExit, onZoneDwell, GEOFENCE_STATUS_LABEL,
  type GeofenceStatus, type ZoneRole,
} from '@/lib/geo/geofenceStateMachine';

export interface GeofenceCheckResult {
  checkedTrips: number;
  transitions: Array<{ vehicleTripId: string; tripNumber: string; from: string | null; to: string; zoneName: string | null }>;
  errors: string[];
}

export async function runGeofenceCheck(): Promise<GeofenceCheckResult> {
  const result: GeofenceCheckResult = { checkedTrips: 0, transitions: [], errors: [] };

  const zoneRoles = await prisma.wialonZoneRole.findMany();
  if (zoneRoles.length === 0) {
    return result; // ни одна зона не размечена — проверять нечего
  }
  const roleByZoneId = new Map(zoneRoles.map((r) => [r.wialonZoneId, r.role as ZoneRole]));

  let zones;
  try {
    zones = await getZones();
  } catch (e: any) {
    result.errors.push(`Не удалось получить геозоны Wialon: ${e?.message ?? e}`);
    return result;
  }
  const taggedZones = zones.filter((z) => roleByZoneId.has(String(z.id)));
  if (taggedZones.length === 0) return result;

  const trips = await prisma.vehicleTrip.findMany({
    where: { status: 'active', vehicle: { wialonUnitId: { not: null } } },
    select: {
      id: true, tripNumber: true, vehicleId: true, geofenceStatus: true, geofenceStatusAt: true, currentZoneId: true,
      vehicle: { select: { wialonUnitId: true } },
    },
  });
  if (trips.length === 0) return result;

  let snapshot;
  try {
    snapshot = await getFleetSnapshot();
  } catch (e: any) {
    result.errors.push(`Не удалось получить снимок парка Wialon: ${e?.message ?? e}`);
    return result;
  }
  const byUnitId = new Map(snapshot.map((s) => [String(s.unitId), s]));

  for (const trip of trips) {
    result.checkedTrips++;
    const unitId = trip.vehicle.wialonUnitId;
    if (!unitId) continue;
    const pos = byUnitId.get(unitId);
    if (!pos || pos.lat == null || pos.lon == null) continue;

    // Какая (если есть) размеченная зона содержит текущую точку машины — если попала
    // в несколько сразу, берём первую по порядку (пересекающиеся зоны — редкий случай,
    // не разбираем приоритет отдельно).
    const zoneNow = taggedZones.find((z) => isPointInZone(pos.lat!, pos.lon!, z)) ?? null;
    const zoneNowId = zoneNow ? String(zoneNow.id) : null;

    const current = (trip.geofenceStatus as GeofenceStatus | null) ?? null;
    let next: GeofenceStatus | null = null;
    let zoneNameForEvent: string | null = null;

    if (zoneNowId !== trip.currentZoneId) {
      if (zoneNow) {
        // Въезд в новую зону
        const role = roleByZoneId.get(zoneNowId!)!;
        next = onZoneEnter(current, role);
        zoneNameForEvent = zoneNow.name;
      } else if (trip.currentZoneId) {
        // Выезд из прошлой зоны (сейчас нигде из размеченных)
        const prevRole = roleByZoneId.get(trip.currentZoneId);
        if (prevRole) {
          next = onZoneExit(current, prevRole);
          const prevZone = taggedZones.find((z) => String(z.id) === trip.currentZoneId);
          zoneNameForEvent = prevZone?.name ?? null;
        }
      }
    } else if (zoneNow && current && trip.geofenceStatusAt) {
      // Остаёмся в той же зоне — проверяем "дозревание" статуса по времени.
      const role = roleByZoneId.get(zoneNowId!)!;
      const minutesSince = (Date.now() - trip.geofenceStatusAt.getTime()) / 60000;
      next = onZoneDwell(current, role, minutesSince);
      zoneNameForEvent = zoneNow.name;
    }

    // currentZoneId обновляем всегда, если сменилась зона — даже если статус не изменился
    // (например, роль зоны не предполагает перехода в этом состоянии).
    if (zoneNowId !== trip.currentZoneId) {
      await prisma.vehicleTrip.update({ where: { id: trip.id }, data: { currentZoneId: zoneNowId } });
    }

    if (next && next !== current) {
      const now = new Date();
      await prisma.vehicleTrip.update({
        where: { id: trip.id },
        data: { geofenceStatus: next, geofenceStatusAt: now },
      });
      await prisma.vehicleTripEvent.create({
        data: {
          vehicleTripId: trip.id,
          action: 'status_changed',
          field: 'geofenceStatus',
          oldValue: current,
          newValue: next,
          zoneName: zoneNameForEvent,
        },
      });
      result.transitions.push({
        vehicleTripId: trip.id,
        tripNumber: trip.tripNumber,
        from: current ? GEOFENCE_STATUS_LABEL[current] : null,
        to: GEOFENCE_STATUS_LABEL[next],
        zoneName: zoneNameForEvent,
      });
    }
  }

  return result;
}
