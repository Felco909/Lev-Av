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
    const driverFilter = searchParams.get('driverId');
    const showArchived = searchParams.get('showArchived');
    // ?kind=tractor|trailer — для мест, где по смыслу нужен только один тип (заявки/рейсы —
    // только тягачи, см. добавление полуприцепов). Без параметра — оба типа, как раньше.
    const kindFilter = searchParams.get('kind');
    const where: any = {};
    if (driverFilter) where.driverId = driverFilter;
    if (kindFilter === 'tractor' || kindFilter === 'trailer') where.kind = kindFilter;
    // Архивные машины (мягкое удаление, см. DELETE ниже) скрыты по умолчанию —
    // тот же паттерн, что showArchived у /api/vehicle-trips и /api/trips.
    if (showArchived !== '1') where.status = { not: 'archived' };
    const vehicles = await prisma.vehicle.findMany({
      where,
      include: { driver: { select: { id: true, fullName: true, phone: true } } },
      orderBy: { plateNumber: 'asc' },
    });
    return NextResponse.json(vehicles ?? []);
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
    if (!body?.plateNumber || !body?.brand || !body?.model) return NextResponse.json({ error: 'Заполните все поля' }, { status: 400 });
    const kind = body?.kind === 'trailer' ? 'trailer' : 'tractor';
    const v = await prisma.vehicle.create({
      data: {
        plateNumber: body.plateNumber, brand: body.brand, model: body.model,
        status: body?.status ?? 'active', driverId: body?.driverId || null,
        kind,
        vin: body?.vin || null,
        year: body?.year != null && body.year !== '' ? Number(body.year) : null,
      },
    });
    return NextResponse.json(v);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
