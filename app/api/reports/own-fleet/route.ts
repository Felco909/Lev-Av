export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { computeVehicleTripExpensesAmd } from '@/lib/vehicle-trips/close-trip';
import { getVehicleTripsIncomeAmdBulk } from '@/lib/finance/own-fleet-income';

function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * GET /api/reports/own-fleet — доход/расход/прибыль собственного транспорта за период
 * для вкладки "Свой автопарк" (/reports). Единственный источник — та же связка, что уже
 * используется в /api/director-finance ("ownTransport"), /api/dashboard ("ownFleet"),
 * /api/vehicle-analytics, /api/vehicles/[id]/economics: доход — сумма заявок, ЯВНО
 * привязанных к рейсу (Trip.vehicleTripId, lib/finance/own-fleet-income.ts), расход —
 * computeVehicleTripExpensesAmd (lib/vehicle-trips/close-trip.ts, зарплата + суточные×4 +
 * прочее + топливо + FleetExpense). Период фильтрует рейсы по VehicleTrip.departureDate —
 * так же, как director-finance, а не заявки по Trip.tripDate (см. аудит: до этого доход
 * и расход на /reports считались по двум независимым, несвязанным выборкам и могли
 * расходиться с остальными разделами).
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const vehicleTripWhere: any = {};
    if (dateFrom || dateTo) {
      vehicleTripWhere.departureDate = {};
      if (dateFrom) vehicleTripWhere.departureDate.gte = new Date(dateFrom);
      if (dateTo) vehicleTripWhere.departureDate.lte = new Date(dateTo);
    }

    const vehicleTrips = await prisma.vehicleTrip.findMany({
      where: vehicleTripWhere,
      select: {
        id: true, tripNumber: true, departureDate: true,
        vehicle: { select: { plateNumber: true } },
        salaryAmd: true, perDiemAmd: true, perDiem2Amd: true, perDiem3Amd: true, perDiem4Amd: true,
        otherExpensesAmd: true, fuelCostAmd: true,
        fleetExpenses: {
          select: { id: true, date: true, expenseType: true, amount: true, currency: true, exchangeRate: true, amountAmd: true, comment: true },
        },
      },
      orderBy: { departureDate: 'desc' },
    });

    const vehicleTripIds = vehicleTrips.map((vt) => vt.id);
    const incomeByVt = await getVehicleTripsIncomeAmdBulk(vehicleTripIds);

    // Отменённая заявка (Этап 4 аудита) — не в детализацию "Доход по заявкам", та же
    // логика, что уже в getVehicleTripsIncomeAmdBulk для итоговой суммы.
    const matchedTrips = vehicleTripIds.length
      ? await prisma.trip.findMany({
          where: { vehicleTripId: { in: vehicleTripIds }, NOT: { status: 'cancelled' } },
          select: {
            id: true, tripNumber: true, tripDate: true, routeFrom: true, routeTo: true,
            clientRateAmd: true, clientRate: true, vehicleTripId: true,
            client: { select: { name: true } },
          },
          orderBy: { tripDate: 'asc' },
        })
      : [];

    let totalIncomeAmd = 0;
    let totalSalaryAmd = 0;
    let totalPerDiemAmd = 0;
    let totalFuelAmd = 0;
    let totalOtherAmd = 0;
    let totalFleetExpAmd = 0;

    const vehicleTripRows = vehicleTrips.map((vt) => {
      const incomeAmd = roundMoney(incomeByVt.get(vt.id) ?? 0);
      const salaryAmd = roundMoney(Number(vt.salaryAmd) || 0);
      const perDiemAmd = roundMoney(
        (Number(vt.perDiemAmd) || 0) + (Number(vt.perDiem2Amd) || 0) + (Number(vt.perDiem3Amd) || 0) + (Number(vt.perDiem4Amd) || 0)
      );
      const fuelAmd = roundMoney(Number(vt.fuelCostAmd) || 0);
      const otherAmd = roundMoney(Number(vt.otherExpensesAmd) || 0);
      const fleetExpAmd = roundMoney(vt.fleetExpenses.reduce((s, e) => s + (Number(e.amountAmd) || 0), 0));
      const expensesAmd = roundMoney(computeVehicleTripExpensesAmd(vt));

      totalIncomeAmd += incomeAmd;
      totalSalaryAmd += salaryAmd;
      totalPerDiemAmd += perDiemAmd;
      totalFuelAmd += fuelAmd;
      totalOtherAmd += otherAmd;
      totalFleetExpAmd += fleetExpAmd;

      return {
        id: vt.id,
        tripNumber: vt.tripNumber,
        vehiclePlate: vt.vehicle.plateNumber,
        departureDate: vt.departureDate,
        incomeAmd,
        expensesAmd,
        profitAmd: roundMoney(incomeAmd - expensesAmd),
      };
    });

    const fleetExpenseRows = vehicleTrips.flatMap((vt) =>
      // Форма строки — как раньше отдавал /api/fleet-expenses (rows), чтобы таблица
      // "Расходы автопарка" в reports/page.tsx осталась без изменений (fe.vehicle?.plateNumber).
      vt.fleetExpenses.map((e) => ({
        id: e.id,
        date: e.date,
        vehicle: { plateNumber: vt.vehicle.plateNumber },
        expenseType: e.expenseType,
        amount: Number(e.amount),
        currency: e.currency,
        exchangeRate: Number(e.exchangeRate),
        amountAmd: Number(e.amountAmd),
        comment: e.comment,
      }))
    );

    const totalExpensesAmd = roundMoney(totalSalaryAmd + totalPerDiemAmd + totalFuelAmd + totalOtherAmd + totalFleetExpAmd);

    return NextResponse.json({
      vehicleTrips: vehicleTripRows,
      // Поля названы так же, как раньше отдавал /api/reports/trips (date/client), чтобы
      // существующая таблица "Доход по заявкам" и CSV-экспорт в reports/page.tsx не
      // требовали правок помимо смены источника данных.
      matchedTrips: matchedTrips.map((t) => ({
        id: t.id,
        tripNumber: t.tripNumber,
        date: t.tripDate.toISOString().split('T')[0],
        routeFrom: t.routeFrom,
        routeTo: t.routeTo,
        client: t.client?.name ?? '',
        clientRateAmd: Number(t.clientRateAmd ?? t.clientRate ?? 0),
      })),
      fleetExpenseRows,
      totals: {
        incomeAmd: roundMoney(totalIncomeAmd),
        expensesAmd: totalExpensesAmd,
        profitAmd: roundMoney(totalIncomeAmd - totalExpensesAmd),
        breakdown: {
          salary: roundMoney(totalSalaryAmd),
          perDiem: roundMoney(totalPerDiemAmd),
          fuel: roundMoney(totalFuelAmd),
          other: roundMoney(totalOtherAmd),
          fleetExpenses: roundMoney(totalFleetExpAmd),
        },
      },
    });
  } catch (error) {
    console.error('Own fleet report API error:', error);
    return NextResponse.json({ error: 'Ошибка отчёта по собственному флоту' }, { status: 500 });
  }
}
