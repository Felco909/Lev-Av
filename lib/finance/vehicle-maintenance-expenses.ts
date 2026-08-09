import { prisma } from '@/lib/prisma';

/**
 * Расходы на ТО (ServiceRecord) + запчасти (PartPurchase) по машинам за период — учитываются
 * в прибыли собственного транспорта наравне с зарплатой/суточными/топливом/FleetExpense (см.
 * CLAUDE.md, TMS-AUDIT-0023: раньше нигде не вычитались, прибыль по своему транспорту была
 * системно завышена). Модель Maintenance (отдельная от ServiceRecord) была удалена
 * (TMS-AUDIT-0046) — никогда не имела пути записи ни в UI, ни в API, таблица была всегда
 * пуста; весь ТО фактически вёлся через ServiceRecord/ServiceRegulation.
 *
 * Эти расходы привязаны к Vehicle+date, НЕ к конкретному VehicleTrip (один комплект ТО может
 * покрывать несколько рейсов машины за период) — поэтому это добавка к итогам отчёта поверх
 * суммы computeVehicleTripExpensesAmd() по рейсам, а не поле внутри неё самой.
 */
export interface MaintenancePartsDateRange {
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * Расходы на ТО/запчасти по нескольким машинам одним запросом (без похода в БД на каждую) —
 * тот же стиль, что getVehicleTripsIncomeAmdBulk (lib/finance/own-fleet-income.ts).
 * Возвращает Map<vehicleId, суммаAmd>; машины без расходов в карте отсутствуют (0 подразумевается).
 */
export async function getVehicleMaintenancePartsExpensesAmdBulk(
  vehicleIds: string[],
  range: MaintenancePartsDateRange = {},
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (vehicleIds.length === 0) return map;

  const dateWhere = range.dateFrom || range.dateTo ? { gte: range.dateFrom, lte: range.dateTo } : undefined;
  const add = (vehicleId: string, amount: number) => map.set(vehicleId, (map.get(vehicleId) ?? 0) + amount);

  const [service, parts] = await Promise.all([
    prisma.serviceRecord.findMany({
      where: { vehicleId: { in: vehicleIds }, ...(dateWhere ? { date: dateWhere } : {}) },
      select: { vehicleId: true, cost: true },
    }),
    prisma.partPurchase.findMany({
      where: { vehicleId: { in: vehicleIds }, ...(dateWhere ? { date: dateWhere } : {}) },
      select: { vehicleId: true, totalAmount: true },
    }),
  ]);

  for (const s of service) add(s.vehicleId, Number(s.cost) || 0);
  for (const p of parts) add(p.vehicleId, Number(p.totalAmount) || 0);

  return map;
}

/** Сумма по всем переданным машинам сразу — для мест, где не нужна разбивка по машине. */
export async function getVehicleMaintenancePartsExpensesAmd(
  vehicleIds: string[],
  range: MaintenancePartsDateRange = {},
): Promise<number> {
  const byVehicle = await getVehicleMaintenancePartsExpensesAmdBulk(vehicleIds, range);
  let total = 0;
  for (const v of byVehicle.values()) total += v;
  return total;
}
