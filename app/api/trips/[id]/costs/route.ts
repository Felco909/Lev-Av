import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const trip = await prisma.trip.findUnique({ where: { id: params.id }, select: { vehicleId: true, tripDate: true, vehicleTripId: true } });
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 });

  // Топливо — источник истины VehicleTrip/Wialon (Аудит топлива, 2026-07-24), по точной связи
  // Trip.vehicleTripId, а не по старой месячной эвристике vehicleId+tripDate (та задваивала расход,
  // если у машины несколько заявок в одном месяце). Сумма — целиком на рейс: если рейс обслуживает
  // несколько заявок, каждая видит полную сумму с пометкой fuelTripsCount (без деления). Рейс без
  // привязки («Ожидает привязки») — не показываем оценку, fuelSource='unattached'.
  let fuelCost = 0;
  let fuelLiters: number | null = null;
  let fuelPer100Km: number | null = null;
  let fuelTripsCount = 0;
  let fuelSource: 'vehicle_trip' | 'unattached' = 'unattached';

  if (trip.vehicleTripId) {
    const [vt, siblingCount] = await Promise.all([
      prisma.vehicleTrip.findUnique({
        where: { id: trip.vehicleTripId },
        select: { fuelCostAmd: true, calculatedFuelConsumedL: true, wialonAvgFuelConsumptionPer100Km: true },
      }),
      prisma.trip.count({ where: { vehicleTripId: trip.vehicleTripId, NOT: { status: 'cancelled' } } }),
    ]);
    if (vt) {
      fuelCost = Number(vt.fuelCostAmd) || 0;
      fuelLiters = vt.calculatedFuelConsumedL != null ? Number(vt.calculatedFuelConsumedL) : null;
      fuelPer100Km = vt.wialonAvgFuelConsumptionPer100Km ?? null;
      fuelTripsCount = siblingCount;
      fuelSource = 'vehicle_trip';
    }
  }

  // ТО/ремонт — вне периметра этой миграции (нет связи с VehicleTrip), старая месячная эвристика
  // осталась как была (Аудит топлива, 2026-07-24 — решение: не трогать в этом шаге).
  let maintenanceCost = 0;
  let maintenanceRecords: { date: Date; type: string; cost: number; description: string | null }[] = [];
  if (trip.vehicleId && trip.tripDate) {
    const tripDate = new Date(trip.tripDate);
    const monthStart = new Date(tripDate.getFullYear(), tripDate.getMonth(), 1);
    const monthEnd = new Date(tripDate.getFullYear(), tripDate.getMonth() + 1, 0);
    const records = await prisma.maintenance.findMany({
      where: { vehicleId: trip.vehicleId, date: { gte: monthStart, lte: monthEnd } },
      orderBy: { date: 'asc' },
    });
    maintenanceCost = records.reduce((s, r) => s + Number(r.cost ?? 0), 0);
    maintenanceRecords = records.map((r) => ({ date: r.date, type: r.type, cost: Number(r.cost), description: r.description }));
  }

  return NextResponse.json({
    fuelCost: Math.round(fuelCost),
    fuelLiters,
    fuelPer100Km,
    fuelSource,
    fuelTripsCount,
    maintenanceCost: Math.round(maintenanceCost),
    totalCost: Math.round(fuelCost + maintenanceCost),
    maintenanceRecords,
  });
}
