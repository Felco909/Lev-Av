export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

/**
 * GET /api/vehicles/[id]/economics — общий доход/расходы/прибыль машины по всем её рейсам
 * (Этап 5, карточка машины). Формула — ТА ЖЕ, что в app/api/vehicle-trips/[id]/route.ts
 * (revenue из связанных Trip.clientRateAmd + прямые расходы рейса + FleetExpense), просто
 * суммируется по всем VehicleTrip машины, а не по одному. Не путать с
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
      salaryAmd: true, perDiemAmd: true, perDiem2Amd: true, perDiem3Amd: true,
      otherExpensesAmd: true, fuelCostAmd: true,
      trips: { select: { clientRateAmd: true, clientRate: true } },
      fleetExpenses: { select: { amountAmd: true } },
    },
  });

  let totalRevenue = 0;
  let totalExpenses = 0;
  for (const vt of vehicleTrips) {
    const revenue = vt.trips.reduce((s, t) => s + Number(t.clientRateAmd || t.clientRate || 0), 0);
    const directSalaryAmd = Number(vt.salaryAmd) || 0;
    const directPerDiemAmd = (Number(vt.perDiemAmd) || 0) + (Number(vt.perDiem2Amd) || 0) + (Number(vt.perDiem3Amd) || 0);
    const directOtherAmd = Number(vt.otherExpensesAmd) || 0;
    const directFuelAmd = Number(vt.fuelCostAmd) || 0;
    const fleetExpTotal = vt.fleetExpenses.reduce((s, e) => s + Number(e.amountAmd), 0);

    totalRevenue += revenue;
    totalExpenses += directSalaryAmd + directPerDiemAmd + directOtherAmd + directFuelAmd + fleetExpTotal;
  }

  const profit = totalRevenue - totalExpenses;

  return NextResponse.json({
    tripsCount: vehicleTrips.length,
    totalRevenue,
    totalExpenses,
    profit,
  });
}
