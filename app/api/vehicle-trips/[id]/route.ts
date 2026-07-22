import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { computeVehicleTripFinancials } from '@/lib/vehicle-trips/revenue';

export const dynamic = 'force-dynamic';

/**
 * GET /api/vehicle-trips/[id] — full detail + linked trips + expenses + profit calc.
 *
 * Доход: "Доработка логики рейсов" (финальная архитектура) — Trip.vehicleTripId нигде
 * не заполнялся, поэтому раньше доход всегда показывал 0. Теперь:
 * Этап 3 миграции на архитектуру "заявка → рейс": список заявок рейса теперь всегда
 * читается через явную связь Trip.vehicleTripId — даты в этом расчёте не участвуют.
 * Если рейс уже заморожен закрытием (finalRevenueAmd не null) — сумма дохода всё равно
 * берётся из замороженного значения (не пересчитывается, даже если ставка заявки
 * изменится после закрытия), список заявок для отображения — тот же явный набор.
 */
export async function GET(_req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const vt = await prisma.vehicleTrip.findUnique({
    where: { id: params.id },
    include: {
      vehicle: { select: { id: true, plateNumber: true, brand: true, model: true, wialonUnitId: true } },
      driver: { select: { id: true, fullName: true } },
      fleetExpenses: {
        include: { vehicle: { select: { plateNumber: true } } },
        orderBy: { date: 'asc' },
      },
    },
  });

  if (!vt) return NextResponse.json({ error: 'Не найден' }, { status: 404 });

  // matchedTrips — заявки, ЯВНО привязанные к этому рейсу (Trip.vehicleTripId), а не
  // подобранные по датам. Работает одинаково для активного и закрытого рейса — состав
  // определяется тем, что было привязано за время его жизни (автопривязкой, вручную,
  // массовым "Добавить заявки"), закрытие само по себе больше ничего не досчитывает.
  const rows = await prisma.trip.findMany({
    where: { vehicleTripId: vt.id },
    select: { id: true, tripNumber: true, routeFrom: true, routeTo: true, tripDate: true, clientRateAmd: true, clientRate: true, client: { select: { name: true } } },
    orderBy: { tripDate: 'asc' },
  });
  const matchedTrips = rows.map((t) => ({
    id: t.id, tripNumber: t.tripNumber, routeFrom: t.routeFrom, routeTo: t.routeTo, tripDate: t.tripDate,
    clientRateAmd: Number(t.clientRateAmd || t.clientRate || 0), clientName: t.client?.name ?? null,
  }));

  // ЕДИНЫЙ источник дохода/расходов/прибыли (lib/vehicle-trips/revenue.ts) — та же функция,
  // что использует /api/vehicles/[id]/economics и /api/vehicle-analytics, чтобы карточка
  // рейса, экономика машины и аналитика никогда не расходились в цифрах.
  const { revenue, totalExpenses, profit, isFrozen } = computeVehicleTripFinancials(vt, matchedTrips);

  // Direct expense fields (on VehicleTrip itself) + FleetExpense — для разбивки по категориям
  // в UI (не влияет на totalExpenses выше — та уже учитывает заморозку).
  const directSalaryAmd = Number(vt.salaryAmd) || 0;
  const directPerDiemAmd = (Number(vt.perDiemAmd) || 0) + (Number(vt.perDiem2Amd) || 0) + (Number(vt.perDiem3Amd) || 0);
  const directOtherAmd = Number(vt.otherExpensesAmd) || 0;
  const directFuelAmd = Number(vt.fuelCostAmd) || 0;
  const directTotalAmd = directSalaryAmd + directPerDiemAmd + directOtherAmd + directFuelAmd;

  const expensesByType: Record<string, number> = {};
  let fleetExpTotal = 0;
  for (const e of vt.fleetExpenses) {
    const amt = Number(e.amountAmd);
    expensesByType[e.expenseType] = (expensesByType[e.expenseType] || 0) + amt;
    fleetExpTotal += amt;
  }

  const mileage = (vt.endMileage != null && vt.startMileage != null) ? vt.endMileage - vt.startMileage : null;

  // Производные показатели рейса (Этап 4) — считаются на лету из уже посчитанных выше сумм,
  // ничего дополнительно не хранится. Пробег — предпочитаем calculatedKm (реальный GPS-трек,
  // см. Этап 2), а не разницу startMileage/endMileage, если она доступна.
  const kmBasis = vt.calculatedKm ?? mileage;
  const costPerKm = kmBasis && kmBasis > 0 ? Math.round((totalExpenses / kmBasis) * 100) / 100 : null;
  const fuelPer100Km =
    kmBasis && kmBasis > 0 && vt.calculatedFuelConsumedL != null
      ? Math.round((vt.calculatedFuelConsumedL / kmBasis) * 100 * 10) / 10
      : null;
  const profitMarginPercent = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null;
  const durationMs = vt.returnDate ? vt.returnDate.getTime() - vt.departureDate.getTime() : null;

  return NextResponse.json({
    ...vt, revenue, totalExpenses, expensesByType, profit, mileage, matchedTrips, isFrozen, durationMs,
    directSalaryAmd, directPerDiemAmd, directOtherAmd, directFuelAmd, directTotalAmd, fleetExpTotal,
    costPerKm, fuelPer100Km, profitMarginPercent,
  });
}
