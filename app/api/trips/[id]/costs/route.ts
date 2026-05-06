import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const trip = await prisma.trip.findUnique({ where: { id: params.id }, select: { vehicleId: true, tripDate: true } });
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
  if (!trip.vehicleId || !trip.tripDate) {
    return NextResponse.json({ fuelCost: 0, maintenanceCost: 0, fuelRecords: [], maintenanceRecords: [], totalCost: 0 });
  }

  // Find fuel and maintenance records for the vehicle around the trip date (same month)
  const tripDate = new Date(trip.tripDate);
  const monthStart = new Date(tripDate.getFullYear(), tripDate.getMonth(), 1);
  const monthEnd = new Date(tripDate.getFullYear(), tripDate.getMonth() + 1, 0);

  const [fuelRecords, maintenanceRecords] = await Promise.all([
    prisma.fuelRecord.findMany({
      where: { vehicleId: trip.vehicleId, date: { gte: monthStart, lte: monthEnd } },
      orderBy: { date: 'asc' },
    }),
    prisma.maintenance.findMany({
      where: { vehicleId: trip.vehicleId, date: { gte: monthStart, lte: monthEnd } },
      orderBy: { date: 'asc' },
    }),
  ]);

  const fuelCost = fuelRecords.reduce((s: number, r: any) => s + Number(r.cost ?? 0), 0);
  const maintenanceCost = maintenanceRecords.reduce((s: number, r: any) => s + Number(r.cost ?? 0), 0);

  return NextResponse.json({
    fuelCost: Math.round(fuelCost),
    maintenanceCost: Math.round(maintenanceCost),
    totalCost: Math.round(fuelCost + maintenanceCost),
    fuelRecords: fuelRecords.map((r: any) => ({ date: r.date, liters: Number(r.liters), cost: Number(r.cost), mileage: r.mileage })),
    maintenanceRecords: maintenanceRecords.map((r: any) => ({ date: r.date, type: r.type, cost: Number(r.cost), description: r.description })),
  });
}
