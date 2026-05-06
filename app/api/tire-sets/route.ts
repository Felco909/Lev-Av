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
    const status = searchParams.get('status');
    const where: any = {};
    if (vehicleId) where.vehicleId = vehicleId;
    if (status) where.status = status;
    const items = await prisma.tireSet.findMany({
      where,
      include: { vehicle: { select: { id: true, plateNumber: true, brand: true, model: true } } },
      orderBy: { createdAt: 'desc' },
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
    const { vehicleId, brand, size, position, installDate, installMileage, status, comment } = body;
    if (!brand || !size) return NextResponse.json({ error: 'Укажите марку и размер' }, { status: 400 });
    const item = await prisma.tireSet.create({
      data: {
        vehicleId: vehicleId || null,
        brand, size,
        position: position || null,
        installDate: installDate ? new Date(installDate) : null,
        installMileage: installMileage ? Number(installMileage) : null,
        status: status || 'installed',
        comment: comment || null,
      },
      include: { vehicle: { select: { id: true, plateNumber: true, brand: true, model: true } } },
    });
    return NextResponse.json(item);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка создания' }, { status: 500 });
  }
}
