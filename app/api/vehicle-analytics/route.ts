export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { computeCostPerKmAmd, computeProfitabilityRatio } from '@/lib/finance/formulas';

/**
 * GET /api/vehicle-analytics — аналитика по каждой машине (Этап 8).
 * Доход/расходы/прибыль — ТА ЖЕ формула, что в app/api/vehicles/[id]/economics/route.ts
 * (см. комментарий там), просто по всем машинам сразу, плюс пробег/топливо/помесячно.
 * Не путать с computeExpeditionProfitAmd/computeOwnTransportProfitAmd (другой модуль, см. CLAUDE.md).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const vehicles = await prisma.vehicle.findMany({ orderBy: { plateNumber: 'asc' } });

    const vehicleTrips = await prisma.vehicleTrip.findMany({
      select: {
        vehicleId: true, departureDate: true, startMileage: true, endMileage: true,
        salaryAmd: true, perDiemAmd: true, perDiem2Amd: true, perDiem3Amd: true,
        otherExpensesAmd: true, fuelCostAmd: true,
        trips: { select: { clientRateAmd: true, clientRate: true } },
        fleetExpenses: { select: { amountAmd: true } },
      },
    });

    // Топливо (заправки) по машине — тот же приём, что в driver-analytics/route.ts.
    const fuelRecords = await prisma.fuelRecord.findMany({ select: { vehicleId: true, liters: true, cost: true } });
    const fuelByVehicle: Record<string, { liters: number; cost: number }> = {};
    fuelRecords.forEach((f) => {
      if (!fuelByVehicle[f.vehicleId]) fuelByVehicle[f.vehicleId] = { liters: 0, cost: 0 };
      fuelByVehicle[f.vehicleId].liters += Number(f.liters);
      fuelByVehicle[f.vehicleId].cost += Number(f.cost);
    });

    const analytics = vehicles.map((vehicle) => {
      const vTrips = vehicleTrips.filter((vt) => vt.vehicleId === vehicle.id);

      let totalRevenue = 0;
      let totalExpenses = 0;
      let totalMileage = 0;
      for (const vt of vTrips) {
        const revenue = vt.trips.reduce((s, t) => s + Number(t.clientRateAmd || t.clientRate || 0), 0);
        const directSalaryAmd = Number(vt.salaryAmd) || 0;
        const directPerDiemAmd = (Number(vt.perDiemAmd) || 0) + (Number(vt.perDiem2Amd) || 0) + (Number(vt.perDiem3Amd) || 0);
        const directOtherAmd = Number(vt.otherExpensesAmd) || 0;
        const directFuelAmd = Number(vt.fuelCostAmd) || 0;
        const fleetExpTotal = vt.fleetExpenses.reduce((s, e) => s + Number(e.amountAmd), 0);

        totalRevenue += revenue;
        totalExpenses += directSalaryAmd + directPerDiemAmd + directOtherAmd + directFuelAmd + fleetExpTotal;

        if (vt.startMileage != null && vt.endMileage != null && vt.endMileage >= vt.startMileage) {
          totalMileage += vt.endMileage - vt.startMileage;
        }
      }
      const profit = totalRevenue - totalExpenses;

      const fuel = fuelByVehicle[vehicle.id] ?? { liters: 0, cost: 0 };

      // Помесячно, последние 6 месяцев (та же схема, что в driver-analytics/route.ts).
      const months: { month: string; trips: number; mileage: number; profit: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const mTrips = vTrips.filter((vt) => {
          const dd = new Date(vt.departureDate);
          return `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}` === ym;
        });
        let mMileage = 0;
        let mProfit = 0;
        for (const vt of mTrips) {
          if (vt.startMileage != null && vt.endMileage != null && vt.endMileage >= vt.startMileage) {
            mMileage += vt.endMileage - vt.startMileage;
          }
          const revenue = vt.trips.reduce((s, t) => s + Number(t.clientRateAmd || t.clientRate || 0), 0);
          const expenses =
            (Number(vt.salaryAmd) || 0) +
            (Number(vt.perDiemAmd) || 0) + (Number(vt.perDiem2Amd) || 0) + (Number(vt.perDiem3Amd) || 0) +
            (Number(vt.otherExpensesAmd) || 0) + (Number(vt.fuelCostAmd) || 0) +
            vt.fleetExpenses.reduce((s, e) => s + Number(e.amountAmd), 0);
          mProfit += revenue - expenses;
        }
        months.push({ month: ym, trips: mTrips.length, mileage: mMileage, profit: mProfit });
      }

      return {
        vehicle: { id: vehicle.id, plateNumber: vehicle.plateNumber, brand: vehicle.brand, model: vehicle.model },
        tripsCount: vTrips.length,
        totalMileage,
        totalRevenue,
        totalExpenses,
        profit,
        totalFuelLiters: Math.round(fuel.liters * 10) / 10,
        totalFuelCost: fuel.cost,
        costPerKm: computeCostPerKmAmd(totalExpenses, totalMileage),
        profitability: computeProfitabilityRatio(profit, totalRevenue),
        months,
      };
    });

    analytics.sort((a, b) => b.profit - a.profit);

    return NextResponse.json(analytics);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
