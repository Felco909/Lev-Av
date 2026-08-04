import { prisma } from '@/lib/prisma';

/**
 * Единственный источник дохода собственного транспорта — доход рейса/машины/парка
 * считается ТОЛЬКО через явную связь Trip.vehicleTripId. Даты (departureDate/
 * returnDate/tripDate) в этом расчёте не участвуют вообще — они остаются только для
 * отображения, поиска, сортировки, подсказок по привязке и отчётов по периодам.
 *
 * Заявка без vehicleTripId ("ожидает привязки") сюда НЕ попадает — это осознанное
 * архитектурное решение: доход считается только по завершённой структуре данных.
 */

function tripClientRateAmd(t: { clientRateAmd: unknown; clientRate: unknown }): number {
  return Number(t.clientRateAmd ?? t.clientRate ?? 0);
}

/**
 * Доход сразу нескольких рейсов одним запросом (без похода в БД на каждый) —
 * для аналитики/дашборда, где рейсов много. Возвращает Map<vehicleTripId, доход>;
 * рейсы без единой привязанной заявки в карте отсутствуют (доход = 0 подразумевается).
 * Отменённые заявки (status='cancelled') исключены — та же логика, что и выше.
 */
export async function getVehicleTripsIncomeAmdBulk(vehicleTripIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (vehicleTripIds.length === 0) return map;
  const trips = await prisma.trip.findMany({
    where: { vehicleTripId: { in: vehicleTripIds }, NOT: { status: 'cancelled' } },
    select: { vehicleTripId: true, clientRateAmd: true, clientRate: true },
  });
  for (const t of trips) {
    if (!t.vehicleTripId) continue;
    map.set(t.vehicleTripId, (map.get(t.vehicleTripId) ?? 0) + tripClientRateAmd(t));
  }
  return map;
}

