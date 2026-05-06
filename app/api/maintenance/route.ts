export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const items = await prisma.maintenance.findMany({
      include: { vehicle: { select: { id: true, plateNumber: true, brand: true, model: true } } },
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
    const { vehicleId, type, description, date, nextDate, cost, mileage, notes } = body;
    if (!vehicleId || !type || !date) {
      return NextResponse.json({ error: 'Заполните обязательные поля' }, { status: 400 });
    }
    const item = await prisma.maintenance.create({
      data: {
        vehicleId,
        type,
        description: description || null,
        date: new Date(date),
        nextDate: nextDate ? new Date(nextDate) : null,
        cost: cost ?? 0,
        mileage: mileage ? Number(mileage) : null,
        notes: notes || null,
      },
      include: { vehicle: { select: { id: true, plateNumber: true, brand: true, model: true } } },
    });
    return NextResponse.json(item);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка создания' }, { status: 500 });
  }
}
