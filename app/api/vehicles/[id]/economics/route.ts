export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { matchTripsInRange, computeVehicleTripFinancials, resolveMatchRangeEnd } from '@/lib/vehicle-trips/revenue';

/**
 * GET /api/vehicles/[id]/economics — общий доход/расходы/прибыль машины по всем её рейсам
 * (Этап 5, карточка машины). ЕДИНЫЙ источник — computeVehicleTripFinancials
 * (lib/vehicle-trips/revenue.ts), та же функция, что у карточки рейса и /api/vehicle-analytics —
 * раньше здесь была отдельная копия сломанной формулы (Trip.vehicleTripId нигде не
 * заполнялся), из-за чего доход всегда показывал 0. Не путать с
 * computeExpeditionProfitAmd/computeOwnTransportProfitAmd в lib/finance/finance-metrics-service.ts —
 * это другая, не идентичная логика для другого модуля (см. CLAUDE.md).
 */
export async function GET(_req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const vehicleTrips = await prisma.vehicleTrip.findMany({
    where: { vehicleId: params.id },
    select: {
      id: true, vehicleId: true, departureDate: true, returnDate: true,
      finalRevenueAmd: true, finalExpensesAmd: true,
      salaryAmd: true, perDiemAmd: true, perDiem2Amd: true, perDiem3Amd: true,
      otherExpensesAmd: true, fuelCostAmd: true,
      fleetExpenses: { select: { amountAmd: true } },
    },
  });

  // Заявки этой машины — один запрос на все рейсы (не N+1), сопоставление в памяти
  // per-рейс через matchTripsInRange. Нужны только для ещё не закрытых рейсов (закрытые
  // используют уже замороженный finalRevenueAmd, live-подбор им не требуется).
  const needsLiveTrips = vehicleTrips.some((vt) => vt.finalRevenueAmd == null);
  const allTrips = needsLiveTrips
    ? await prisma.trip.findMany({
        where: { vehicleId: params.id },
        select: { id: true, tripNumber: true, routeFrom: true, routeTo: true, tripDate: true, clientRateAmd: true, clientRate: true, vehicleId: true, client: { select: { name: true } } },
      })
    : [];

  let totalRevenue = 0;
  let totalExpenses = 0;
  for (const vt of vehicleTrips) {
    const matched = vt.finalRevenueAmd == null
      ? matchTripsInRange(allTrips, params.id, vt.departureDate, resolveMatchRangeEnd(vt, vehicleTrips))
      : [];
    const { revenue, totalExpenses: expenses } = computeVehicleTripFinancials(vt, matched);
    totalRevenue += revenue;
    totalExpenses += expenses;
  }

  const profit = totalRevenue - totalExpenses;

  return NextResponse.json({
    tripsCount: vehicleTrips.length,
    totalRevenue,
    totalExpenses,
    profit,
  });
}
