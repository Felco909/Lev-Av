import { prisma } from '@/lib/prisma';

/**
 * Единственный источник дохода собственного транспорта (Этап 0 новой архитектуры,
 * см. согласованный план) — доход рейса/машины/парка считается ТОЛЬКО через явную
 * связь Trip.vehicleTripId. Даты (departureDate/returnDate/tripDate) в этом расчёте
 * не участвуют вообще — они остаются только для отображения, поиска, сортировки,
 * подсказок по привязке и отчётов по периодам (см. dateRange ниже — это фильтр
 * ПЕРИОДА ОТЧЁТА по датам рейса, а не правило принадлежности заявки рейсу).
 *
 * Пока действует lib/finance/feature-flags.ts (income_calc_mode='legacy') это
 * дополнительный, параллельный расчёт — старые места дохода (lib/vehicle-trips/revenue.ts,
 * lib/finance/finance-metrics-service.ts и т.д.) не тронуты и продолжают работать
 * как раньше. Переключение потребителей на эти функции — отдельные этапы.
 *
 * Заявка без vehicleTripId ("ожидает привязки") сюда НЕ попадает — это осознанное
 * архитектурное решение: доход считается только по завершённой структуре данных.
 */

function tripClientRateAmd(t: { clientRateAmd: unknown; clientRate: unknown }): number {
  return Number(t.clientRateAmd ?? t.clientRate ?? 0);
}

/** Доход одного рейса — сумма клиентских ставок всех явно привязанных к нему заявок. */
export async function getVehicleTripIncomeAmd(vehicleTripId: string): Promise<number> {
  const trips = await prisma.trip.findMany({
    where: { vehicleTripId },
    select: { clientRateAmd: true, clientRate: true },
  });
  return trips.reduce((sum, t) => sum + tripClientRateAmd(t), 0);
}

/**
 * Доход сразу нескольких рейсов одним запросом (без похода в БД на каждый) —
 * для аналитики/дашборда, где рейсов много. Возвращает Map<vehicleTripId, доход>;
 * рейсы без единой привязанной заявки в карте отсутствуют (доход = 0 подразумевается).
 */
export async function getVehicleTripsIncomeAmdBulk(vehicleTripIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (vehicleTripIds.length === 0) return map;
  const trips = await prisma.trip.findMany({
    where: { vehicleTripId: { in: vehicleTripIds } },
    select: { vehicleTripId: true, clientRateAmd: true, clientRate: true },
  });
  for (const t of trips) {
    if (!t.vehicleTripId) continue;
    map.set(t.vehicleTripId, (map.get(t.vehicleTripId) ?? 0) + tripClientRateAmd(t));
  }
  return map;
}

export interface DateRangeFilter {
  from?: Date;
  to?: Date;
}

/**
 * Доход машины за период — сумма доходов ВСЕХ её рейсов (через vehicleTripId).
 * dateRange фильтрует рейсы по VehicleTrip.departureDate — это диапазон отчёта,
 * не критерий принадлежности заявки. Заявки без vehicleTripId не учитываются
 * (см. заголовочный комментарий файла) — это ожидаемое поведение новой архитектуры,
 * а не потеря данных: такие заявки видны отдельно через lib/finance/integrity-check.ts.
 */
export async function getVehicleIncomeAmd(vehicleId: string, dateRange?: DateRangeFilter): Promise<number> {
  const vtWhere: any = { vehicleId };
  if (dateRange?.from || dateRange?.to) {
    vtWhere.departureDate = {};
    if (dateRange.from) vtWhere.departureDate.gte = dateRange.from;
    if (dateRange.to) vtWhere.departureDate.lte = dateRange.to;
  }
  const vehicleTrips = await prisma.vehicleTrip.findMany({ where: vtWhere, select: { id: true } });
  const ids = vehicleTrips.map((v) => v.id);
  if (ids.length === 0) return 0;
  const bulk = await getVehicleTripsIncomeAmdBulk(ids);
  let total = 0;
  for (const v of bulk.values()) total += v;
  return total;
}

/** Доход по всем собственным машинам сразу — для director-finance/dashboard/reports. */
export async function getFleetIncomeAmd(dateRange?: DateRangeFilter): Promise<number> {
  const vtWhere: any = {};
  if (dateRange?.from || dateRange?.to) {
    vtWhere.departureDate = {};
    if (dateRange.from) vtWhere.departureDate.gte = dateRange.from;
    if (dateRange.to) vtWhere.departureDate.lte = dateRange.to;
  }
  const vehicleTrips = await prisma.vehicleTrip.findMany({ where: vtWhere, select: { id: true } });
  const ids = vehicleTrips.map((v) => v.id);
  if (ids.length === 0) return 0;
  const bulk = await getVehicleTripsIncomeAmdBulk(ids);
  let total = 0;
  for (const v of bulk.values()) total += v;
  return total;
}
