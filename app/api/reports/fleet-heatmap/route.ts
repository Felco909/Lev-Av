export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

/**
 * GET /api/reports/fleet-heatmap — загрузка автопарка по дням (Dashboard v3, лениво
 * подгружаемый виджет). Единственная новая агрегация во всём проекте Dashboard v3 —
 * не формула, а календарная раскладка уже хранимых VehicleTrip.departureDate/returnDate
 * (те же поля, что уже показывает список /vehicle-trips) по последним 7 дням.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

    const days = 7;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const rangeStart = new Date(today); rangeStart.setDate(rangeStart.getDate() - (days - 1));

    const vehicles = await prisma.vehicle.findMany({
      where: { status: 'active' },
      select: { id: true, plateNumber: true },
      orderBy: { plateNumber: 'asc' },
    });

    // Рейсы, которые могли пересекаться с окном (выехал до конца окна, вернулся после его начала
    // или ещё в пути) — не только "начались в окне", чтобы не терять многодневные рейсы.
    const vehicleTrips = await prisma.vehicleTrip.findMany({
      where: {
        vehicleId: { in: vehicles.map((v) => v.id) },
        departureDate: { lte: new Date(today.getTime() + 86400000) },
        OR: [{ returnDate: null }, { returnDate: { gte: rangeStart } }],
      },
      select: { vehicleId: true, departureDate: true, returnDate: true, status: true },
    });

    const days7 = Array.from({ length: days }, (_, i) => {
      const d = new Date(rangeStart); d.setDate(d.getDate() + i);
      return d;
    });

    const rows = vehicles.map((v) => {
      const trips = vehicleTrips.filter((vt) => vt.vehicleId === v.id);
      const cells = days7.map((day) => {
        const dayEnd = new Date(day.getTime() + 86400000);
        const onTrip = trips.some((vt) => {
          const start = new Date(vt.departureDate);
          const end = vt.returnDate ? new Date(vt.returnDate) : new Date(); // ещё в рейсе — до "сейчас"
          return start < dayEnd && end >= day;
        });
        return onTrip ? 'trip' : 'idle';
      });
      return { vehicleId: v.id, plateNumber: v.plateNumber, cells };
    });

    return NextResponse.json({
      days: days7.map((d) => d.toISOString().slice(0, 10)),
      rows,
    });
  } catch (e) {
    console.error('Fleet heatmap API error:', e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
