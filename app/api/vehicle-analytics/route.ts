export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { computeCostPerKmAmd, computeProfitabilityRatio, computeProfitPerKmAmd } from '@/lib/finance/formulas';
import { computeVehicleTripExpensesAmd } from '@/lib/vehicle-trips/close-trip';
import { getVehicleTripsIncomeAmdBulk } from '@/lib/finance/own-fleet-income';

/**
 * GET /api/vehicle-analytics — аналитика по каждой машине. Этап 3 миграции на архитектуру
 * "заявка → рейс": доход каждого рейса — сумма заявок, ЯВНО привязанных к нему
 * (Trip.vehicleTripId), даты в расчёте не участвуют. Та же формула расходов
 * (computeVehicleTripExpensesAmd), что у карточки рейса и /api/vehicles/[id]/economics —
 * расхождение между разделами архитектурно исключено, т.к. это один и тот же запрос.
 * Не путать с computeExpeditionProfitAmd/computeOwnTransportProfitAmd (другой модуль, см. CLAUDE.md).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const vehicles = await prisma.vehicle.findMany({ orderBy: { plateNumber: 'asc' } });

    const vehicleTrips = await prisma.vehicleTrip.findMany({
      select: {
        id: true, vehicleId: true, departureDate: true, returnDate: true, startMileage: true, endMileage: true, calculatedKm: true,
        calculatedFuelConsumedL: true, fuelCostAmd: true,
        salaryAmd: true, perDiemAmd: true, perDiem2Amd: true, perDiem3Amd: true, perDiem4Amd: true,
        otherExpensesAmd: true,
        fleetExpenses: { select: { amountAmd: true, expenseType: true } },
      },
    });

    // Доход всех рейсов одним запросом (не N+1) — по явной связи Trip.vehicleTripId.
    const incomeByVt = await getVehicleTripsIncomeAmdBulk(vehicleTrips.map((vt) => vt.id));

    const analytics = vehicles.map((vehicle) => {
      const vTrips = vehicleTrips.filter((vt) => vt.vehicleId === vehicle.id);

      let totalRevenue = 0;
      let totalExpenses = 0;
      let totalMileage = 0;
      let totalFuelLiters = 0;
      let totalFuelKm = 0;
      let totalFuelCost = 0;
      // Финансы каждого рейса считаем один раз (используются и в итоге, и в помесячной разбивке).
      const perTrip = vTrips.map((vt) => {
        const revenue = incomeByVt.get(vt.id) ?? 0;
        const totalExpenses = computeVehicleTripExpensesAmd(vt);
        const financials = { revenue, totalExpenses, profit: revenue - totalExpenses };
        // Пробег — только официальный отчёт Wialon (calculatedKm), тот же источник, что и
        // "Итоги рейса" в карточке (см. lib/wialon/calculateTripFuel.ts) — без fallback на
        // разницу одометра, иначе аналитика расходится с карточкой рейса и с самим Wialon.
        const mileage = vt.calculatedKm != null ? Number(vt.calculatedKm) : 0;
        // Топливо — источник истины VehicleTrip/Wialon (Аудит топлива, 2026-07-24), не FuelRecord:
        // литры/км — calculatedFuelConsumedL/calculatedKm (тот же источник, что на /fuel),
        // стоимость — только fuelCostAmd (та же величина, что "Топливо" в /api/reports/own-fleet;
        // FleetExpense — отдельный расходный поток, туда не подмешиваем, как и там).
        const fuelLiters = vt.calculatedFuelConsumedL != null ? Number(vt.calculatedFuelConsumedL) : 0;
        const fuelCostAmd = Number(vt.fuelCostAmd) || 0;
        return { vt, financials, mileage, fuelLiters, fuelCostAmd };
      });

      for (const { financials, mileage, fuelLiters, fuelCostAmd, vt } of perTrip) {
        totalRevenue += financials.revenue;
        totalExpenses += financials.totalExpenses;
        totalMileage += mileage;
        totalFuelLiters += fuelLiters;
        totalFuelCost += fuelCostAmd;
        if (vt.calculatedKm != null) totalFuelKm += Number(vt.calculatedKm);
      }
      const profit = totalRevenue - totalExpenses;

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
        totalFuelLiters: Math.round(totalFuelLiters * 10) / 10,
        totalFuelCost,
        fuelPer100Km: totalFuelKm > 0 && totalFuelLiters > 0 ? Math.round((totalFuelLiters / totalFuelKm) * 100 * 10) / 10 : null,
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
