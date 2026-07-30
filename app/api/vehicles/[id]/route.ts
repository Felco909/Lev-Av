export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

/** GET /api/vehicles/[id] — карточка машины (Этап 5: вкладки "Основное"/"Телематика") */
export async function GET(_req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: params.id },
    include: { driver: { select: { id: true, fullName: true, phone: true } } },
  });
  if (!vehicle) return NextResponse.json({ error: 'Не найдена' }, { status: 404 });

  return NextResponse.json(vehicle);
}

export async function PUT(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const body = await req.json();
    const data: any = {};
    if (body?.plateNumber !== undefined) data.plateNumber = body.plateNumber;
    if (body?.brand !== undefined) data.brand = body.brand;
    if (body?.model !== undefined) data.model = body.model;
    if (body?.status !== undefined) data.status = body.status;
    if (body?.currentMileage !== undefined) data.currentMileage = body.currentMileage !== null ? Number(body.currentMileage) : null;

    // Handle driver assignment change
    const driverChanged = body?.driverId !== undefined;
    let oldDriverId: string | null = null;
    let oldDriverName: string | null = null;

    if (driverChanged) {
      const current = await prisma.vehicle.findUnique({
        where: { id: params?.id },
        include: { driver: { select: { id: true, fullName: true } } },
      });
      oldDriverId = current?.driverId ?? null;
      oldDriverName = current?.driver?.fullName ?? null;
      data.driverId = body.driverId || null;
    }

    const v = await prisma.vehicle.update({
      where: { id: params?.id },
      data,
      include: { driver: { select: { id: true, fullName: true, phone: true } } },
    });

    // Record history and re-link trips/maintenance if driver changed
    if (driverChanged && oldDriverId !== (body.driverId || null)) {
      let newDriverName: string | null = null;
      if (body.driverId) {
        const nd = await prisma.driver.findUnique({ where: { id: body.driverId }, select: { fullName: true } });
        newDriverName = nd?.fullName ?? null;
      }

      await prisma.driverVehicleHistory.create({
        data: {
          vehicleId: params.id,
          oldDriverId,
          oldDriverName,
          newDriverId: body.driverId || null,
          newDriverName,
        },
      });

      // Re-link active trips (new/in_progress) for this vehicle to new driver
      if (body.driverId) {
        await prisma.trip.updateMany({
          where: { vehicleId: params.id, status: { in: ['new', 'in_progress'] } },
          data: { driverId: body.driverId },
        });
      }
    }

    return NextResponse.json(v);
  } catch (e: any) {
    console.error('Vehicle update error:', e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}

/**
 * DELETE — мягкое удаление (архивирование), а не физическое. Физическое удаление машины
 * каскадно сносит VehicleTrip/FleetExpense/FuelRecord/Maintenance/ServiceRecord/PartPurchase/
 * DriverVehicleHistory (ON DELETE CASCADE в БД) и молча обнуляет Trip.vehicleId/vehicleTripId
 * (ON DELETE SET NULL) — заявки задним числом выпадают из дохода собственного транспорта без
 * следа. Архивирование ничего не удаляет и не теряет историю: машина лишь скрывается из
 * активных списков (см. GET выше, showArchived) и может быть восстановлена.
 */
export async function DELETE(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    const vehicleId = params?.id;

    const existing = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true, status: true } });
    if (!existing) return NextResponse.json({ error: 'Не найдена' }, { status: 404 });
    if (existing.status === 'archived') return NextResponse.json({ success: true, archived: true, message: 'Машина уже в архиве.' });

    const [vehicleTrips, fleetExpenses, fuelRecords, maintenances, serviceRecords, tireSets, partPurchases, driverHistory, trips] = await Promise.all([
      prisma.vehicleTrip.count({ where: { vehicleId } }),
      prisma.fleetExpense.count({ where: { vehicleId } }),
      prisma.fuelRecord.count({ where: { vehicleId } }),
      prisma.maintenance.count({ where: { vehicleId } }),
      prisma.serviceRecord.count({ where: { vehicleId } }),
      prisma.tireSet.count({ where: { vehicleId } }),
      prisma.partPurchase.count({ where: { vehicleId } }),
      prisma.driverVehicleHistory.count({ where: { vehicleId } }),
      prisma.trip.count({ where: { vehicleId } }),
    ]);
    const totalDependents = vehicleTrips + fleetExpenses + fuelRecords + maintenances + serviceRecords + tireSets + partPurchases + driverHistory + trips;

    await prisma.vehicle.update({ where: { id: vehicleId }, data: { status: 'archived' } });

    if (totalDependents > 0) {
      return NextResponse.json({
        success: true,
        archived: true,
        message: `Машина архивирована (не удалена) — сохранена история: рейсов ${vehicleTrips}, заявок ${trips}, расходов парка ${fleetExpenses}, заправок ${fuelRecords}, ТО ${maintenances + serviceRecords}, шин ${tireSets}, закупок запчастей ${partPurchases}, смен водителя ${driverHistory}.`,
      });
    }
    return NextResponse.json({ success: true, archived: true, message: 'Машина архивирована.' });
  } catch (e: any) {
    console.error('Vehicle archive error:', e);
    return NextResponse.json({ error: 'Не удалось архивировать машину' }, { status: 500 });
  }
}
