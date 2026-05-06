export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const { id } = await params;
    const body = await req.json();
    const { vehicleId, type, description, date, nextDate, cost, mileage, notes } = body;
    const item = await prisma.maintenance.update({
      where: { id },
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
    return NextResponse.json({ error: 'Ошибка обновления' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const { id } = await params;
    await prisma.maintenance.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка удаления' }, { status: 500 });
  }
}
