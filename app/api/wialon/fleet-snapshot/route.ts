export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { getFleetSnapshot, WialonApiError } from '@/lib/wialon/client';

/** Живой снимок всего парка (координаты/пробег/топливо/скорость/время последнего сообщения)
 *  для машин, у которых заполнен Vehicle.wialonUnitId — сопоставляет с карточками TMS. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const vehicles = await prisma.vehicle.findMany({
    where: { wialonUnitId: { not: null } },
    select: {
      id: true, plateNumber: true, brand: true, model: true, wialonUnitId: true,
      driver: { select: { fullName: true } },
      vehicleTrips: {
        where: { status: 'active' },
        select: { id: true, tripNumber: true, departureDate: true },
        orderBy: { departureDate: 'desc' },
        take: 1,
      },
    },
  });

  if (vehicles.length === 0) {
    return NextResponse.json({ vehicles: [] });
  }

  try {
    const snapshot = await getFleetSnapshot();
    const byUnitId = new Map(snapshot.map((s) => [String(s.unitId), s]));

    const result = vehicles.map((v) => {
      const s = v.wialonUnitId ? byUnitId.get(v.wialonUnitId) : undefined;
      const activeTrip = v.vehicleTrips[0] ?? null;
      return {
        vehicleId: v.id,
        plateNumber: v.plateNumber,
        brand: v.brand,
        model: v.model,
        driverName: v.driver?.fullName ?? null,
        wialonUnitId: v.wialonUnitId,
        mileageKm: s?.mileageKm ?? null,
        fuelLevelL: s?.fuelLevelL ?? null,
        lat: s?.lat ?? null,
        lon: s?.lon ?? null,
        speedKmh: s?.speedKmh ?? null,
        lastMessageAt: s?.lastMessageAt ? s.lastMessageAt.toISOString() : null,
        activeTripNumber: activeTrip?.tripNumber ?? null,
      };
    });

    return NextResponse.json({ vehicles: result });
  } catch (e: any) {
    if (e instanceof WialonApiError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    console.error('[api/wialon/fleet-snapshot] Ошибка:', e);
    return NextResponse.json({ error: e?.message ?? 'Неизвестная ошибка' }, { status: 500 });
  }
}
