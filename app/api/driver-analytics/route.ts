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
    // Get fuel expenses from trip expenses
    const fuelExpenses = await prisma.expense.findMany({
      where: { expenseType: 'fuel' },
      select: { tripId: true, amount: true },
    });
    const fuelByTrip: Record<string, number> = {};
    fuelExpenses.forEach(f => { fuelByTrip[f.tripId] = (fuelByTrip[f.tripId] || 0) + Number(f.amount); });

    // Get fuel records per vehicle
    const fuelRecords = await prisma.fuelRecord.findMany({
      select: { vehicleId: true, liters: true, cost: true, mileage: true },
    });
    // Build fuel totals by vehicleId
    const fuelByVehicle: Record<string, { liters: number; cost: number }> = {};
    fuelRecords.forEach(f => {
      if (!fuelByVehicle[f.vehicleId]) fuelByVehicle[f.vehicleId] = { liters: 0, cost: 0 };
      fuelByVehicle[f.vehicleId].liters += Number(f.liters);
      fuelByVehicle[f.vehicleId].cost += Number(f.cost);
    });

    // Get trips with vehicleId for fuel association
    const tripsWithVehicle = await prisma.trip.findMany({
      where: { driverId: { not: null }, vehicleId: { not: null }, NOT: { status: 'cancelled' } },
      select: { driverId: true, vehicleId: true },
    });
    // Build driver → set of vehicleIds
    const driverVehicles: Record<string, Set<string>> = {};
    tripsWithVehicle.forEach(t => {
      if (t.driverId && t.vehicleId) {
        if (!driverVehicles[t.driverId]) driverVehicles[t.driverId] = new Set();
        driverVehicles[t.driverId].add(t.vehicleId);
      }
    });

    const analytics = drivers.map(driver => {
      const driverTrips = trips.filter(t => t.driverId === driver.id);
      const totalTrips = driverTrips.length;
      const totalRevenue = driverTrips.reduce((s, t) => s + Number(t.clientRateAmd ?? t.clientRate ?? 0), 0);
      const totalProfit = driverTrips.reduce((s, t) => s + Number(t.profitAmd ?? t.profit ?? 0), 0);
      const totalDistance = driverTrips.reduce((s, t) => s + (t.distance || 0), 0);
      const totalCargo = driverTrips.reduce((s, t) => s + Number(t.cargoWeight || 0), 0);
      const totalFuelCost = driverTrips.reduce((s, t) => s + (fuelByTrip[t.id] || 0), 0);
      const completedTrips = driverTrips.filter(t => t.status === 'completed' || t.status === 'paid').length;

      // Fuel efficiency from fuel records of associated vehicles
      const vIds = driverVehicles[driver.id] ?? new Set();
      let totalLiters = 0;
      let totalFuelRecordCost = 0;
      vIds.forEach(vid => {
        const fv = fuelByVehicle[vid];
        if (fv) { totalLiters += fv.liters; totalFuelRecordCost += fv.cost; }
      });

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
        // KPI: fuel efficiency (L/100km), profit per km, cost per trip
        fuelEfficiency: totalDistance > 0 && totalLiters > 0 ? Math.round((totalLiters / totalDistance) * 100 * 10) / 10 : null,
        profitPerKm: totalDistance > 0 ? Math.round(totalProfit / totalDistance) : 0,
        costPerTrip: totalTrips > 0 ? Math.round(totalFuelRecordCost / totalTrips) : 0,
        totalFuelLiters: Math.round(totalLiters * 10) / 10,
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
