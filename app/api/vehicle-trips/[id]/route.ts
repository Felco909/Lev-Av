import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** GET /api/vehicle-trips/[id] — full detail + linked trips + expenses + profit calc */
export async function GET(_req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const vt = await prisma.vehicleTrip.findUnique({
    where: { id: params.id },
    include: {
      vehicle: { select: { id: true, plateNumber: true, brand: true, model: true } },
      driver: { select: { id: true, fullName: true } },
      trips: {
        select: {
          id: true, tripNumber: true, routeFrom: true, routeTo: true,
          tripDate: true, clientRateAmd: true, clientRate: true,
          status: true, client: { select: { name: true } },
        },
        orderBy: { tripDate: 'asc' },
      },
      fleetExpenses: {
        include: { vehicle: { select: { plateNumber: true } } },
        orderBy: { date: 'asc' },
      },
    },
  });

  if (!vt) return NextResponse.json({ error: 'Не найден' }, { status: 404 });

  // Calculate totals
  const revenue = vt.trips.reduce((s, t) => s + Number(t.clientRateAmd || t.clientRate || 0), 0);

  // Direct expense fields (on VehicleTrip itself)
  const directSalaryAmd = Number(vt.salaryAmd) || 0;
  const directPerDiemAmd = Number(vt.perDiemAmd) || 0;
  const directOtherAmd = Number(vt.otherExpensesAmd) || 0;
  const directFuelAmd = Number(vt.fuelCostAmd) || 0;
  const directTotalAmd = directSalaryAmd + directPerDiemAmd + directOtherAmd + directFuelAmd;

  // FleetExpense relation totals (legacy/additional)
  const expensesByType: Record<string, number> = {};
  let fleetExpTotal = 0;
  for (const e of vt.fleetExpenses) {
    const amt = Number(e.amountAmd);
    expensesByType[e.expenseType] = (expensesByType[e.expenseType] || 0) + amt;
    fleetExpTotal += amt;
  }

  const totalExpenses = directTotalAmd + fleetExpTotal;
  const profit = revenue - totalExpenses;
  const mileage = (vt.endMileage && vt.startMileage) ? vt.endMileage - vt.startMileage : null;

  return NextResponse.json({
    ...vt, revenue, totalExpenses, expensesByType, profit, mileage,
    directSalaryAmd, directPerDiemAmd, directOtherAmd, directFuelAmd, directTotalAmd, fleetExpTotal,
  });
}
