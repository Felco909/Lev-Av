/**
 * Синхронизация Vehicle.currentMileage с показаниями одометра Wialon.
 * Общая логика для /api/wialon/sync-mileage (ручной/UI-триггер) и
 * scripts/wialon-sync-mileage.ts (ежедневный запуск по расписанию Windows).
 *
 * Обновляются только машины с заполненным Vehicle.wialonUnitId — сопоставление
 * "какая машина TMS = какой unit в Wialon" в этом шаге не строится (нет UI для
 * этого), см. отчёт по Шагу 5.
 */
import { prisma } from '@/lib/prisma';
import { login, getUnitsWithMileage } from '@/lib/wialon/client';

export interface SyncMileageResult {
  totalVehiclesWithWialonId: number;
  updated: number;
  unchanged: number;
  /** Wialon отдал пробег МЕНЬШЕ уже сохранённого Vehicle.currentMileage — не перезаписываем
   *  автоматически (переустановка датчика на другую машину, сброс счётчика, ручная правка в
   *  Wialon могли бы иначе откатить пробег назад и скрыть реально просроченное ТО, см.
   *  TMS-AUDIT-0022). Фиксируем для ручной проверки вместо тихого отката. */
  skippedLowerThanCurrent: Array<{ vehicleId: string; plateNumber: string; currentMileage: number; wialonMileage: number }>;
  notFoundInWialon: Array<{ vehicleId: string; plateNumber: string; wialonUnitId: string }>;
  errors: Array<{ vehicleId: string; plateNumber: string; message: string }>;
}

export async function syncVehicleMileageFromWialon(): Promise<SyncMileageResult> {
  const vehicles = await prisma.vehicle.findMany({
    where: { wialonUnitId: { not: null } },
    select: { id: true, plateNumber: true, wialonUnitId: true, currentMileage: true },
  });

  const result: SyncMileageResult = {
    totalVehiclesWithWialonId: vehicles.length,
    updated: 0,
    unchanged: 0,
    skippedLowerThanCurrent: [],
    notFoundInWialon: [],
    errors: [],
  };

  if (vehicles.length === 0) {
    return result;
  }

  const { sid } = await login();
  const units = await getUnitsWithMileage(sid);
  const unitById = new Map(units.map((u) => [String(u.id), u]));

  const now = new Date();

  for (const vehicle of vehicles) {
    try {
      const unit = unitById.get(String(vehicle.wialonUnitId));
      if (!unit) {
        result.notFoundInWialon.push({
          vehicleId: vehicle.id,
          plateNumber: vehicle.plateNumber,
          wialonUnitId: vehicle.wialonUnitId!,
        });
        continue;
      }
      if (unit.mileageKm == null) {
        result.unchanged++;
        continue;
      }
      const newMileage = Math.round(unit.mileageKm);
      if (vehicle.currentMileage === newMileage) {
        // Пробег не изменился — обновляем только метку времени синхронизации.
        await prisma.vehicle.update({
          where: { id: vehicle.id },
          data: { currentMileageUpdatedAt: now },
        });
        result.unchanged++;
        continue;
      }
      if (vehicle.currentMileage != null && newMileage < vehicle.currentMileage) {
        // Wialon отдал меньше уже сохранённого — не откатываем автоматически (TMS-AUDIT-0022,
        // тот же принцип монотонности, что и у остальных писателей currentMileage:
        // lib/vehicle-trips/close-trip.ts maybeSyncVehicleMileage, записи топлива/ТО).
        result.skippedLowerThanCurrent.push({
          vehicleId: vehicle.id,
          plateNumber: vehicle.plateNumber,
          currentMileage: vehicle.currentMileage,
          wialonMileage: newMileage,
        });
        continue;
      }
      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { currentMileage: newMileage, currentMileageUpdatedAt: now },
      });
      result.updated++;
    } catch (e: any) {
      result.errors.push({ vehicleId: vehicle.id, plateNumber: vehicle.plateNumber, message: e?.message ?? String(e) });
    }
  }

  return result;
}
