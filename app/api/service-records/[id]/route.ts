export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { assertRole, VEHICLE_TRIP_FINANCIAL_ROLES } from '@/lib/auth/role-guard';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const guard = assertRole(session, VEHICLE_TRIP_FINANCIAL_ROLES, 'редактирование записи ТО');
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
    const { id } = await params;
    const body = await req.json();
    const { vehicleId, regulationId, date, mileage, cost, comment } = body;
    const item = await prisma.serviceRecord.update({
      where: { id },
      data: {
        vehicleId,
        regulationId,
        date: new Date(date),
        mileage: Number(mileage),
        cost: cost ? Number(cost) : 0,
        comment: comment || null,
      },
      include: {
        vehicle: { select: { id: true, plateNumber: true, brand: true, model: true, currentMileage: true } },
        regulation: { select: { id: true, name: true, mileageInterval: true, monthsInterval: true } },
      },
    });
    return NextResponse.json(item);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка обновления' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const guard = assertRole(session, VEHICLE_TRIP_FINANCIAL_ROLES, 'удаление записи ТО');
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
    const { id } = await params;
    await prisma.serviceRecord.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка удаления' }, { status: 500 });
  }
}
