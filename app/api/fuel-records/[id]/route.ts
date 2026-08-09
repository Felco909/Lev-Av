export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { assertRole, VEHICLE_TRIP_FINANCIAL_ROLES } from '@/lib/auth/role-guard';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const guard = assertRole(session, VEHICLE_TRIP_FINANCIAL_ROLES, 'удаление записи о заправке');
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
    const { id } = await params;
    const record = await prisma.fuelRecord.findUnique({ where: { id }, select: { vehicleId: true, mileage: true } });
    await prisma.fuelRecord.delete({ where: { id } });
    // TMS-AUDIT-0030: если удалённая запись задавала текущий пробег машины — пересчитать
    // из оставшихся записей заправок, а не оставлять устаревшее завышенное значение.
    if (record) {
      const vehicle = await prisma.vehicle.findUnique({ where: { id: record.vehicleId }, select: { currentMileage: true } });
      if (vehicle?.currentMileage === record.mileage) {
        const remaining = await prisma.fuelRecord.findFirst({
          where: { vehicleId: record.vehicleId },
          orderBy: { mileage: 'desc' },
          select: { mileage: true },
        });
        if (remaining) {
          await prisma.vehicle.update({ where: { id: record.vehicleId }, data: { currentMileage: remaining.mileage } });
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка удаления' }, { status: 500 });
  }
}
