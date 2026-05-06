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
    const data: any = {};
    if (body.vehicleId !== undefined) data.vehicleId = body.vehicleId || null;
    if (body.brand !== undefined) data.brand = body.brand;
    if (body.size !== undefined) data.size = body.size;
    if (body.position !== undefined) data.position = body.position || null;
    if (body.installDate !== undefined) data.installDate = body.installDate ? new Date(body.installDate) : null;
    if (body.installMileage !== undefined) data.installMileage = body.installMileage ? Number(body.installMileage) : null;
    if (body.removeDate !== undefined) data.removeDate = body.removeDate ? new Date(body.removeDate) : null;
    if (body.removeMileage !== undefined) data.removeMileage = body.removeMileage ? Number(body.removeMileage) : null;
    if (body.status !== undefined) data.status = body.status;
    if (body.comment !== undefined) data.comment = body.comment || null;
    const item = await prisma.tireSet.update({
      where: { id },
      data,
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
    await prisma.tireSet.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка удаления' }, { status: 500 });
  }
}
