export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { computeCostPerKmAmd, computeProfitabilityRatio, computeProfitPerKmAmd } from '@/lib/finance/formulas';
import { matchTripsInRange, computeVehicleTripFinancials, resolveMatchRangeEnd } from '@/lib/vehicle-trips/revenue';

/**
 * GET /api/vehicle-analytics — аналитика по каждой машине (Этап 8, пересмотрено —
 * "Финальная доработка логики рейсов и аналитики"). Доход/расходы/прибыль — ЕДИНЫЙ
 * источник computeVehicleTripFinancials (lib/vehicle-trips/revenue.ts), та же функция,
 * что у карточки рейса и /api/vehicles/[id]/economics. Раньше здесь была отдельная копия
 * сломанной формулы (Trip.vehicleTripId нигде не заполнялся) — доход всегда был 0, из-за
 * чего аналитика расходилась с (тоже сломанной) карточкой рейса. Теперь обе точки — одна
 * и та же функция, расхождение архитектурно исключено.
 * Не путать с computeExpeditionProfitAmd/computeOwnTransportProfitAmd (другой модуль, см. CLAUDE.md).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const vehicles = await prisma.vehicle.findMany({ orderBy: { plateNumber: 'asc' } });

    const vehicleTrips = await prisma.vehicleTrip.findMany({
      select: {
        vehicleId: true, departureDate: true, returnDate: true, startMileage: true, endMileage: true, calculatedKm: true,
        finalRevenueAmd: true, finalExpensesAmd: true,
        salaryAmd: true, perDiemAmd: true, perDiem2Amd: true, perDiem3Amd: true,
        otherExpensesAmd: true, fuelCostAmd: true,
        fleetExpenses: { select: { amountAmd: true } },
      },
    });

    // Заявки всех машин — один запрос (не N+1), сопоставление в памяти per-рейс.
    const allTrips = await prisma.trip.findMany({
      select: { id: true, tripNumber: true, routeFrom: true, routeTo: true, tripDate: true, clientRateAmd: true, clientRate: true, vehicleId: true, client: { select: { name: true } } },
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
      // Финансы каждого рейса считаем один раз (используются и в итоге, и в помесячной разбивке).
      const perTrip = vTrips.map((vt) => {
        const matched = vt.finalRevenueAmd == null
          ? matchTripsInRange(allTrips, vehicle.id, vt.departureDate, resolveMatchRangeEnd(vt, vTrips))
          : [];
        const financials = computeVehicleTripFinancials(vt, matched);
        // Пробег — только официальный отчёт Wialon (calculatedKm), тот же источник, что и
        // "Итоги рейса" в карточке (см. lib/wialon/calculateTripFuel.ts) — без fallback на
        // разницу одометра, иначе аналитика расходится с карточкой рейса и с самим Wialon.
        const mileage = vt.calculatedKm != null ? Number(vt.calculatedKm) : 0;
        return { vt, financials, mileage };
      });

      for (const { financials, mileage } of perTrip) {
        totalRevenue += financials.revenue;
        totalExpenses += financials.totalExpenses;
        totalMileage += mileage;
      }
      const profit = totalRevenue - totalExpenses;

      const fuel = fuelByVehicle[vehicle.id] ?? { liters: 0, cost: 0 };

      // Помесячно, последние 6 месяцев (та же схема, что в driver-analytics/route.ts) —
      // рейс целиком относится к месяцу своей даты выезда (не разбивается по месяцам,
      // даже если сам рейс длиннее месяца — та же логика, что была раньше).
      const months: { month: string; trips: number; mileage: number; profit: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const inMonth = perTrip.filter(({ vt }) => {
          const dd = new Date(vt.departureDate);
          return `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}` === ym;
        });
        const mMileage = inMonth.reduce((s, { mileage }) => s + mileage, 0);
        const mProfit = inMonth.reduce((s, { financials }) => s + financials.profit, 0);
        months.push({ month: ym, trips: inMonth.length, mileage: mMileage, profit: mProfit });
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
        avgRevenuePerTrip: vTrips.length > 0 ? Math.round(totalRevenue / vTrips.length) : 0,
        costPerKm: computeCostPerKmAmd(totalExpenses, totalMileage),
        profitPerKm: computeProfitPerKmAmd(profit, totalMileage),
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
