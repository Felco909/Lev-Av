export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { computeVehicleTripExpensesAmd } from '@/lib/vehicle-trips/close-trip';
import { getVehicleTripsIncomeAmdBulk } from '@/lib/finance/own-fleet-income';

/**
 * GET /api/vehicles/[id]/economics — общий доход/расходы/прибыль машины по всем её рейсам
 * (карточка машины). Доход — сумма заявок, ЯВНО привязанных к каждому рейсу
 * (Trip.vehicleTripId, см. lib/finance/own-fleet-income.ts), даты в расчёте не участвуют.
 * Расходы — computeVehicleTripExpensesAmd (lib/vehicle-trips/close-trip.ts), та же функция,
 * что у карточки рейса, /api/vehicle-analytics и /api/director-finance. Не путать с
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
      id: true, finalRevenueAmd: true, finalExpensesAmd: true,
      salaryAmd: true, perDiemAmd: true, perDiem2Amd: true, perDiem3Amd: true,
      otherExpensesAmd: true, fuelCostAmd: true,
      fleetExpenses: { select: { amountAmd: true } },
    },
  });

  const incomeByVt = await getVehicleTripsIncomeAmdBulk(vehicleTrips.map((vt) => vt.id));

  let totalRevenue = 0;
  let totalExpenses = 0;
  for (const vt of vehicleTrips) {
    const revenue = vt.finalRevenueAmd != null ? Number(vt.finalRevenueAmd) : (incomeByVt.get(vt.id) ?? 0);
    const expenses = vt.finalExpensesAmd != null ? Number(vt.finalExpensesAmd) : computeVehicleTripExpensesAmd(vt);
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
