export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const drivers = await prisma.driver.findMany({ where: { status: 'active' }, orderBy: { fullName: 'asc' } });
    // Отменённая заявка (Этап 4 аудита) — не в доход/прибыль аналитики по водителям.
    const trips = await prisma.trip.findMany({
      where: { driverId: { not: null }, NOT: { status: 'cancelled' } },
      select: { id: true, driverId: true, clientRate: true, clientRateAmd: true, profit: true, profitAmd: true, distance: true, cargoWeight: true, status: true, tripDate: true, tripType: true },
    });

    // Топливо — только источник истины VehicleTrip/Wialon (Аудит топлива, 2026-07-24),
    // не Expense (расход заявки) и не FuelRecord (вспомогательный журнал заправок).
    // Стоимость — только fuelCostAmd (та же величина, что "Топливо" в /api/reports/own-fleet
    // и /api/vehicle-analytics; FleetExpense — отдельный расходный поток, сюда не входит).
    const vehicleTrips = await prisma.vehicleTrip.findMany({
      where: { driverId: { not: null } },
      select: { driverId: true, calculatedFuelConsumedL: true, calculatedKm: true, fuelCostAmd: true },
    });
    const fuelByDriver: Record<string, { liters: number; km: number; costAmd: number; vehicleTripsCount: number }> = {};
    vehicleTrips.forEach(vt => {
      if (!vt.driverId) return;
      if (!fuelByDriver[vt.driverId]) fuelByDriver[vt.driverId] = { liters: 0, km: 0, costAmd: 0, vehicleTripsCount: 0 };
      const f = fuelByDriver[vt.driverId];
      if (vt.calculatedFuelConsumedL != null) f.liters += vt.calculatedFuelConsumedL;
      if (vt.calculatedKm != null) f.km += vt.calculatedKm;
      f.costAmd += Number(vt.fuelCostAmd) || 0;
      f.vehicleTripsCount += 1;
    });

    const analytics = drivers.map(driver => {
      const driverTrips = trips.filter(t => t.driverId === driver.id);
      const totalTrips = driverTrips.length;
      const totalRevenue = driverTrips.reduce((s, t) => s + Number(t.clientRateAmd ?? t.clientRate ?? 0), 0);
      const totalProfit = driverTrips.reduce((s, t) => s + Number(t.profitAmd ?? t.profit ?? 0), 0);
      const totalDistance = driverTrips.reduce((s, t) => s + (t.distance || 0), 0);
      const totalCargo = driverTrips.reduce((s, t) => s + Number(t.cargoWeight || 0), 0);
      const completedTrips = driverTrips.filter(t => t.status === 'completed' || t.status === 'paid').length;

      // Топливо — по физическим рейсам машины (VehicleTrip.driverId), не по заявкам:
      // у одного водителя количество VehicleTrip обычно не равно totalTrips (заявок).
      const fuel = fuelByDriver[driver.id] ?? { liters: 0, km: 0, costAmd: 0, vehicleTripsCount: 0 };
      const totalFuelCost = fuel.costAmd;

      // Monthly breakdown (last 6 months)
      const months: { month: string; trips: number; profit: number; distance: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const mTrips = driverTrips.filter(t => {
          const td = new Date(t.tripDate);
          return `${td.getFullYear()}-${String(td.getMonth() + 1).padStart(2, '0')}` === ym;
        });
        months.push({
          month: ym,
          trips: mTrips.length,
          profit: mTrips.reduce((s, t) => s + Number(t.profitAmd ?? t.profit ?? 0), 0),
          distance: mTrips.reduce((s, t) => s + (t.distance || 0), 0),
        });
      }

      return {
        driver: { id: driver.id, fullName: driver.fullName, phone: driver.phone, licenseNumber: driver.licenseNumber },
        totalTrips, completedTrips, totalRevenue, totalProfit, totalDistance, totalCargo, totalFuelCost,
        avgProfitPerTrip: totalTrips > 0 ? Math.round(totalProfit / totalTrips) : 0,
        avgDistancePerTrip: totalTrips > 0 ? Math.round(totalDistance / totalTrips) : 0,
        // KPI: fuel efficiency (L/100km), profit per km, cost per trip.
        // Расход/пробег — Wialon (VehicleTrip.calculatedKm), не distance заявки (другая величина).
        fuelEfficiency: fuel.km > 0 && fuel.liters > 0 ? Math.round((fuel.liters / fuel.km) * 100 * 10) / 10 : null,
        profitPerKm: totalDistance > 0 ? Math.round(totalProfit / totalDistance) : 0,
        // На рейс (VehicleTrip), не на заявку — топливные данные привязаны к физическому рейсу машины.
        costPerTrip: fuel.vehicleTripsCount > 0 ? Math.round(totalFuelCost / fuel.vehicleTripsCount) : 0,
        totalFuelLiters: Math.round(fuel.liters * 10) / 10,
        months,
      };
    });

    // Sort by total profit desc
    analytics.sort((a, b) => b.totalProfit - a.totalProfit);

    return NextResponse.json(analytics);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
