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

export async function DELETE(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
    await prisma.vehicle.delete({ where: { id: params?.id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: 'Невозможно удалить' }, { status: 500 });
  }
}
