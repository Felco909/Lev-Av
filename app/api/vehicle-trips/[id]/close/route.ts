export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { getFleetSnapshot } from '@/lib/wialon/client';
import { calculateVehicleTripTotals } from '@/lib/wialon/calculateTripFuel';
import { maybeSyncVehicleMileage, computeVehicleTripExpensesAmd, validateNoOverlappingVehicleTripDates } from '@/lib/vehicle-trips/close-trip';
import { findMatchingTrips, sumRevenueAmd } from '@/lib/vehicle-trips/revenue';

/**
 * POST /api/vehicle-trips/[id]/close — ручное закрытие рейса ("Доработка логики рейсов",
 * финальная архитектура). Автозакрытие по возврату на базу убрано — теперь диспетчер сам
 * выбирает дату/время окончания, и в этот момент:
 * 1) один раз берётся живой снимок Wialon (getFleetSnapshot — существующая функция, тот же
 *    источник, что и кнопка "Обновить сейчас" — интеграция не меняется);
 * 2) один раз вызывается существующий calculateVehicleTripTotals (GPS-трек выезд-возврат);
 * 3) фиксируется набор заявок этой машины за период рейса (простановка Trip.vehicleTripId —
 *    это поле раньше нигде не заполнялось) и замораживается доход/расходы.
 * После этого — status=completed, дальше ничего из этого не пересчитывается автоматически
 * (см. заморозку в PUT/maybeCalculateTotals).
 */
export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  const userId = (session.user as any)?.id as string | undefined;

  const body = await req.json().catch(() => ({}));
  const { returnDate } = body;
  if (!returnDate) return NextResponse.json({ error: 'Укажите дату и время закрытия' }, { status: 400 });
  const closeDate = new Date(returnDate);
  if (Number.isNaN(closeDate.getTime())) return NextResponse.json({ error: 'Некорректная дата' }, { status: 400 });

  const trip = await prisma.vehicleTrip.findUnique({
    where: { id: params.id },
    include: { vehicle: { select: { id: true, wialonUnitId: true, currentMileage: true } }, fleetExpenses: true },
  });
  if (!trip) return NextResponse.json({ error: 'Рейс не найден' }, { status: 404 });
  if (trip.status !== 'active') {
    return NextResponse.json({ error: 'Закрыть можно только активный рейс' }, { status: 400 });
  }
  if (closeDate.getTime() < trip.departureDate.getTime()) {
    return NextResponse.json({ error: 'Дата закрытия не может быть раньше даты выезда' }, { status: 400 });
  }

  const overlapError = await validateNoOverlappingVehicleTripDates(trip.vehicleId, trip.departureDate, closeDate, trip.id);
  if (overlapError) return NextResponse.json({ error: overlapError }, { status: 400 });

  // 1) Живой снимок Wialon — один раз, тот же источник, что и "Обновить сейчас".
  let liveSnapshotError: string | null = null;
  let endMileage: number | null = trip.endMileage;
  let endFuel: number | null = trip.endFuel != null ? Number(trip.endFuel) : null;
  let returnLat: number | null = trip.returnLat;
  let returnLon: number | null = trip.returnLon;
  if (trip.vehicle.wialonUnitId) {
    try {
      const fleet = await getFleetSnapshot();
      const unit = fleet.find((u) => String(u.unitId) === trip.vehicle.wialonUnitId);
      if (unit) {
        if (unit.mileageKm != null) endMileage = Math.round(unit.mileageKm);
        if (unit.fuelLevelL != null) endFuel = unit.fuelLevelL;
        if (unit.lat != null) returnLat = unit.lat;
        if (unit.lon != null) returnLon = unit.lon;
      } else {
        liveSnapshotError = 'Машина не найдена в снимке Wialon';
      }
    } catch (e) {
      liveSnapshotError = `Не удалось получить снимок Wialon: ${(e as Error).message}`;
    }
  }

  // 2) Сохраняем даты/снимок ПЕРЕД расчётом итогов — calculateVehicleTripTotals читает
  // departureDate/returnDate заново из БД.
  await prisma.vehicleTrip.update({
    where: { id: trip.id },
    data: { returnDate: closeDate, endMileage, endFuel, returnLat, returnLon },
  });

  let calcError: string | null = null;
  try {
    await calculateVehicleTripTotals(trip.id);
  } catch (e) {
    calcError = `Не удалось рассчитать пробег/топливо по GPS-треку: ${(e as Error).message}`;
  }

  // 3) Фиксируем набор заявок за период рейса и замораживаем доход/расходы.
  const matched = await findMatchingTrips(trip.vehicleId, trip.departureDate, closeDate);
  if (matched.length > 0) {
    await prisma.trip.updateMany({
      where: { id: { in: matched.map((t) => t.id) } },
      data: { vehicleTripId: trip.id },
    });
  }
  const finalRevenueAmd = sumRevenueAmd(matched);
  const finalExpensesAmd = computeVehicleTripExpensesAmd(trip);

  const closed = await prisma.vehicleTrip.update({
    where: { id: trip.id },
    data: {
      status: 'completed',
      closedAt: new Date(),
      closedByUserId: userId ?? null,
      finalRevenueAmd,
      finalExpensesAmd,
    },
    include: {
      vehicle: { select: { id: true, plateNumber: true, brand: true, model: true } },
      driver: { select: { id: true, fullName: true } },
    },
  });

  await maybeSyncVehicleMileage(trip.vehicleId, endMileage);

  await prisma.vehicleTripEvent.create({
    data: {
      vehicleTripId: trip.id, action: 'closed', field: 'status', oldValue: 'active', newValue: 'completed', userId: userId ?? null,
    },
  });

  return NextResponse.json({
    ...closed,
    matchedTripsCount: matched.length,
    warnings: [liveSnapshotError, calcError].filter(Boolean),
  });
}
