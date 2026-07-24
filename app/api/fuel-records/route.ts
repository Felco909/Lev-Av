export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const vehicleId = searchParams.get('vehicleId');
    const where: any = {};
    if (vehicleId) where.vehicleId = vehicleId;
    const items = await prisma.fuelRecord.findMany({
      where,
      include: { vehicle: { select: { id: true, plateNumber: true, brand: true, model: true, currentMileage: true } } },
      orderBy: { date: 'desc' },
    });
    return NextResponse.json(items);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const body = await req.json();
    const { vehicleId, vehicleTripId, date, liters, cost, mileage, comment } = body;
    if (!vehicleId || !date || !liters || mileage === undefined) {
      return NextResponse.json({ error: 'Заполните обязательные поля' }, { status: 400 });
    }
    const mil = Number(mileage);
    const item = await prisma.fuelRecord.create({
      data: {
        vehicleId,
        vehicleTripId: vehicleTripId || null,
        date: new Date(date),
        liters: Number(liters),
        cost: cost ? Number(cost) : 0,
        mileage: mil,
        comment: comment || null,
      },
      include: { vehicle: { select: { id: true, plateNumber: true, brand: true, model: true, currentMileage: true } } },
    });
    // Update vehicle mileage if higher
    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { currentMileage: true } });
    if (!vehicle?.currentMileage || mil > vehicle.currentMileage) {
      await prisma.vehicle.update({ where: { id: vehicleId }, data: { currentMileage: mil } });
    }
    return NextResponse.json(item);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка создания' }, { status: 500 });
  }
}
