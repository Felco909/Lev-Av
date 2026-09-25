/**
 * Трекинг простоя машин (dwell) по живым данным Wialon — аудит ТМС 05.09.2026, 🟠 "Wialon
 * dwell-алерты". Работает рядом с lib/company-base/baseCheck.ts (тот же 5-минутный запуск),
 * но полностью отдельно от него: пишет ТОЛЬКО Vehicle.lastMovingAt/lastGpsMessageAt и
 * никогда не трогает VehicleTrip, Trip или присутствие на базе.
 *
 * Сами алерты (пороги, кто попадает) считаются при чтении — lib/fleet/dwell-alerts.ts.
 */
import { prisma } from '@/lib/prisma';
import { getFleetSnapshot, type WialonFleetSnapshotItem } from '@/lib/wialon/client';
import { getVehicleActivityStatus } from '@/lib/wialon/status';
import { DWELL_CHECK_HEARTBEAT_KEY } from '@/lib/dashboard/dwell-alerts';

export interface DwellTrackingState {
  lastMovingAt: Date | null;
  lastGpsMessageAt: Date | null;
}

/**
 * Следующие значения колонок трекинга для одной машины, или null, если ничего не меняется.
 *
 * - moving  → lastMovingAt = время сообщения (никогда не назад);
 * - stopped → lastMovingAt не трогаем; если машину ещё ни разу не наблюдали, ставим
 *             базовую точку "сейчас" — реальное начало стоянки неизвестно, и лучше
 *             занизить простой, чем поднять ложный многодневный алерт (тот же принцип,
 *             что isFirstObservation в baseCheck.ts);
 * - no_signal → только lastGpsMessageAt (по нему считается "нет связи").
 */
export function nextDwellTrackingState(
  current: DwellTrackingState,
  pos: Pick<WialonFleetSnapshotItem, 'speedKmh' | 'lastMessageAt'>,
  now: Date,
): Partial<DwellTrackingState> | null {
  const update: Partial<DwellTrackingState> = {};

  if (pos.lastMessageAt && pos.lastMessageAt.getTime() !== current.lastGpsMessageAt?.getTime()) {
    update.lastGpsMessageAt = pos.lastMessageAt;
  }

  const status = getVehicleActivityStatus(pos.speedKmh, pos.lastMessageAt);
  if (status === 'moving' && pos.lastMessageAt) {
    if (!current.lastMovingAt || pos.lastMessageAt > current.lastMovingAt) {
      update.lastMovingAt = pos.lastMessageAt;
    }
  } else if (status === 'stopped' && current.lastMovingAt == null) {
    update.lastMovingAt = now;
  }

  return Object.keys(update).length > 0 ? update : null;
}

export interface DwellCheckResult {
  checkedVehicles: number;
  updatedVehicles: number;
  errors: string[];
}

export async function runDwellCheck(): Promise<DwellCheckResult> {
  const errors: string[] = [];
  const vehicles = await prisma.vehicle.findMany({
    where: { wialonUnitId: { not: null } },
    select: { id: true, plateNumber: true, wialonUnitId: true, lastMovingAt: true, lastGpsMessageAt: true },
  });
  if (vehicles.length === 0) return { checkedVehicles: 0, updatedVehicles: 0, errors };

  let snapshot: WialonFleetSnapshotItem[];
  try {
    snapshot = await getFleetSnapshot();
  } catch (e) {
    errors.push(`Не удалось получить снимок парка Wialon: ${(e as Error).message}`);
    return { checkedVehicles: 0, updatedVehicles: 0, errors };
  }
  const posByUnitId = new Map(snapshot.map((s) => [String(s.unitId), s]));

  const now = new Date();
  let checkedVehicles = 0;
  let updatedVehicles = 0;
  for (const vehicle of vehicles) {
    const pos = posByUnitId.get(String(vehicle.wialonUnitId));
    if (!pos) continue;
    checkedVehicles++;
    const update = nextDwellTrackingState(vehicle, pos, now);
    if (!update) continue;
    try {
      await prisma.vehicle.update({ where: { id: vehicle.id }, data: update });
      updatedVehicles++;
    } catch (e) {
      errors.push(`Машина ${vehicle.plateNumber}: не удалось обновить трекинг простоя — ${(e as Error).message}`);
    }
  }

  // Own heartbeat: alerts are suppressed when this is stale, so a stopped scheduler can't
  // make every vehicle look like it has been standing still since the last run.
  try {
    await prisma.setting.upsert({
      where: { key: DWELL_CHECK_HEARTBEAT_KEY },
      create: { key: DWELL_CHECK_HEARTBEAT_KEY, value: now.toISOString() },
      update: { value: now.toISOString() },
    });
  } catch (e) {
    errors.push(`Не удалось записать heartbeat проверки простоя: ${(e as Error).message}`);
  }

  return { checkedVehicles, updatedVehicles, errors };
}
