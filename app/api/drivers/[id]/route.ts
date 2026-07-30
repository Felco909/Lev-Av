export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function PUT(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const body = await req.json();
    // Частичное обновление (как в PUT /api/vehicles/[id]) — иначе восстановление из архива
    // одним {status:'active'} стирало бы phone/licenseNumber, отсутствующие в теле запроса.
    const data: any = {};
    if (body?.fullName !== undefined) data.fullName = body.fullName;
    if (body?.phone !== undefined) data.phone = body.phone || null;
    if (body?.licenseNumber !== undefined) data.licenseNumber = body.licenseNumber || null;
    if (body?.status !== undefined) data.status = body.status;
    const d = await prisma.driver.update({ where: { id: params?.id }, data });
    return NextResponse.json(d);
  } catch (e: any) {
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}

/**
 * DELETE — мягкое удаление (архивирование), та же архитектура, что и у машины
 * (app/api/vehicles/[id]/route.ts). Физическое удаление водителя молча обнуляет
 * Trip.driverId/VehicleTrip.driverId/Vehicle.driverId/DriverVehicleHistory.newDriverId
 * (ON DELETE SET NULL в БД) — теряется история рейсов, расходов и журнал смен водителя.
 * Архивирование ничего не удаляет: водитель скрывается из активных списков (см. GET
 * выше, showArchived) и может быть восстановлен.
 */
export async function DELETE(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const driverId = params?.id;

    const existing = await prisma.driver.findUnique({ where: { id: driverId }, select: { id: true, status: true } });
    if (!existing) return NextResponse.json({ error: 'Не найден' }, { status: 404 });
    if (existing.status === 'archived') return NextResponse.json({ success: true, archived: true, message: 'Водитель уже в архиве.' });

    const [trips, vehicleTrips, expenses, vehicleHistory, vehiclesAssigned] = await Promise.all([
      prisma.trip.count({ where: { driverId } }),
      prisma.vehicleTrip.count({ where: { driverId } }),
      prisma.expense.count({ where: { trip: { driverId } } }),
      prisma.driverVehicleHistory.count({ where: { newDriverId: driverId } }),
      prisma.vehicle.count({ where: { driverId } }),
    ]);
    const totalDependents = trips + vehicleTrips + expenses + vehicleHistory + vehiclesAssigned;

    await prisma.driver.update({ where: { id: driverId }, data: { status: 'archived' } });

    if (totalDependents > 0) {
      return NextResponse.json({
        success: true,
        archived: true,
        message: `Водитель архивирован (не удалён) — сохранена история: заявок ${trips}, рейсов ${vehicleTrips}, расходов ${expenses}, записей в журнале смен ${vehicleHistory}, назначенных машин ${vehiclesAssigned}.`,
      });
    }
    return NextResponse.json({ success: true, archived: true, message: 'Водитель архивирован.' });
  } catch (e: any) {
    console.error('Driver archive error:', e);
    return NextResponse.json({ error: 'Не удалось архивировать водителя' }, { status: 500 });
  }
}
