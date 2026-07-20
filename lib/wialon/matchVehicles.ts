/**
 * Сопоставляет Vehicle.plateNumber с объектами Wialon (unit.nm) по гос.номеру и заполняет
 * Vehicle.wialonUnitId. Не создаёт дублей — машины с уже заполненным wialonUnitId
 * пропускаются. Логика перенесена сюда из scripts/wialon-match-vehicles.ts (тот теперь
 * тонкая обёртка), используется также из /api/wialon/sync-vehicles.
 */
import { prisma } from '@/lib/prisma';
import { login, getUnits, type WialonUnit } from './client';
import { getStoredWialonToken } from './token-store';

function normalizePlate(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, '');
}

export interface VehicleMatchResult {
  matched: Array<{ vehicleId: string; plateNumber: string; wialonUnitId: string; wialonName: string }>;
  alreadyLinked: Array<{ vehicleId: string; plateNumber: string; wialonUnitId: string }>;
  notFoundInWialon: Array<{ vehicleId: string; plateNumber: string }>;
  wialonUnits: WialonUnit[];
}

export async function matchVehiclesWithWialon(): Promise<VehicleMatchResult> {
  const dbToken = await getStoredWialonToken();
  const { sid } = await login(dbToken ?? undefined);
  const units = await getUnits(sid);
  const unitByPlate = new Map(units.map((u) => [normalizePlate(u.name), u]));

  const vehicles = await prisma.vehicle.findMany({ select: { id: true, plateNumber: true, wialonUnitId: true } });

  const result: VehicleMatchResult = { matched: [], alreadyLinked: [], notFoundInWialon: [], wialonUnits: units };

  for (const v of vehicles) {
    if (v.wialonUnitId) {
      result.alreadyLinked.push({ vehicleId: v.id, plateNumber: v.plateNumber, wialonUnitId: v.wialonUnitId });
      continue;
    }
    const unit = unitByPlate.get(normalizePlate(v.plateNumber));
    if (!unit) {
      result.notFoundInWialon.push({ vehicleId: v.id, plateNumber: v.plateNumber });
      continue;
    }
    await prisma.vehicle.update({ where: { id: v.id }, data: { wialonUnitId: String(unit.id) } });
    result.matched.push({ vehicleId: v.id, plateNumber: v.plateNumber, wialonUnitId: String(unit.id), wialonName: unit.name });
  }

  return result;
}
