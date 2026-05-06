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
    const items = await prisma.serviceRecord.findMany({
      where,
      include: {
        vehicle: { select: { id: true, plateNumber: true, brand: true, model: true, currentMileage: true } },
        regulation: { select: { id: true, name: true, mileageInterval: true, monthsInterval: true } },
      },
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
    const { vehicleId, regulationId, date, mileage, cost, comment } = body;
    if (!vehicleId || !regulationId || !date || mileage === undefined || mileage === null) {
      return NextResponse.json({ error: 'Заполните обязательные поля' }, { status: 400 });
    }
    const mil = Number(mileage);
    // Create the service record
    const item = await prisma.serviceRecord.create({
      data: {
        vehicleId,
        regulationId,
        date: new Date(date),
        mileage: mil,
        cost: cost ? Number(cost) : 0,
        comment: comment || null,
      },
      include: {
        vehicle: { select: { id: true, plateNumber: true, brand: true, model: true, currentMileage: true } },
        regulation: { select: { id: true, name: true, mileageInterval: true, monthsInterval: true } },
      },
    });
    // Also update the vehicle's currentMileage if this mileage is higher
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
