export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    // Driver stats
    const driverTrips = await prisma.trip.groupBy({
      by: ['driverId'],
      where: { driverId: { not: null } },
      _count: true,
      _sum: { profitAmd: true, clientRateAmd: true },
    });
    const drivers = await prisma.driver.findMany({ select: { id: true, fullName: true } });
    const driverMap = Object.fromEntries(drivers.map(d => [d.id, d.fullName]));
    const driverStats = driverTrips.map(d => ({
      id: d.driverId,
      name: driverMap[d.driverId!] || '\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439',
      trips: d._count,
      profit: Number(d._sum.profitAmd ?? 0),
      revenue: Number(d._sum.clientRateAmd ?? 0),
    })).sort((a, b) => b.trips - a.trips);

    // Vehicle stats
    const vehicleTrips = await prisma.trip.groupBy({
      by: ['vehicleId'],
      where: { vehicleId: { not: null } },
      _count: true,
      _sum: { profitAmd: true, clientRateAmd: true },
    });
    const vehicles = await prisma.vehicle.findMany({ select: { id: true, plateNumber: true, brand: true, model: true } });
    const vehicleMap = Object.fromEntries(vehicles.map(v => [v.id, `${v.brand} ${v.model} (${v.plateNumber})`]));
    const vehicleStats = vehicleTrips.map(v => ({
      id: v.vehicleId,
      name: vehicleMap[v.vehicleId!] || '\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F',
      trips: v._count,
      profit: Number(v._sum.profitAmd ?? 0),
      revenue: Number(v._sum.clientRateAmd ?? 0),
    })).sort((a, b) => b.trips - a.trips);

    // Carrier stats
    const carrierTrips = await prisma.trip.groupBy({
      by: ['carrierId'],
      where: { carrierId: { not: null } },
      _count: true,
      _sum: { profitAmd: true, clientRateAmd: true, carrierRateAmd: true },
    });
    const carriersDb = await prisma.carrier.findMany({ select: { id: true, name: true } });
    const carrierMap = Object.fromEntries(carriersDb.map(c => [c.id, c.name]));
    const carrierStats = carrierTrips.map(c => ({
      id: c.carrierId,
      name: carrierMap[c.carrierId!] || '\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439',
      trips: c._count,
      profit: Number(c._sum.profitAmd ?? 0),
      revenue: Number(c._sum.clientRateAmd ?? 0),
      cost: Number(c._sum.carrierRateAmd ?? 0),
    })).sort((a, b) => b.trips - a.trips);

    return NextResponse.json({ driverStats, vehicleStats, carrierStats });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
