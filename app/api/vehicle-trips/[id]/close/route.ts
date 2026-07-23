export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { getFleetSnapshot } from '@/lib/wialon/client';
import { calculateVehicleTripTotals } from '@/lib/wialon/calculateTripFuel';
import { maybeSyncVehicleMileage, validateNoOverlappingVehicleTripDates } from '@/lib/vehicle-trips/close-trip';
import { getUnattachedOwnTrips } from '@/lib/vehicle-trips/attach-service';

/**
 * POST /api/vehicle-trips/[id]/close — ручное закрытие рейса. Диспетчер выбирает
 * дату/время окончания, и в этот момент:
 * 0) если у машины есть НЕпривязанные заявки, чья дата попадает в период рейса —
 *    без body.force возвращаем 409 с их списком (см. lib/vehicle-trips/attach-service.ts) —
 *    фронт предлагает привязать или закрыть как есть (не блокируем НАВСЕГДА, только
 *    предупреждаем один раз за попытку закрытия);
 * 1) один раз берётся живой снимок Wialon (getFleetSnapshot — тот же источник, что и
 *    кнопка "Обновить сейчас");
 * 2) один раз вызывается существующий calculateVehicleTripTotals (GPS-трек выезд-возврат);
 * После этого — status=completed. Доход/расходы/прибыль по-прежнему считаются ВСЕГДА
 * автоматически (см. lib/vehicle-trips/revenue.ts) — закрытие рейса ничего не замораживает
 * и не блокирует дальнейшее редактирование (переработка модуля "Рейсы", 2026-07-23).
 */
export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  const userId = (session.user as any)?.id as string | undefined;

  const body = await req.json().catch(() => ({}));
  const { returnDate, force } = body;
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

  // Заявки этой же машины, ещё не привязанные ни к одному рейсу, чья дата попадает
  // в период закрываемого рейса — не блокируем закрытие, а предупреждаем и даём
  // выбор (см. Этап 2 архитектуры "заявка → рейс": закрытие рейса с "подтверждением,
  // что не относится" не делаем — либо диспетчер привязывает сейчас, либо оставляет
  // как есть и рейс закрывается, заявки остаются в "Ожидают привязки").
  if (!force) {
    const unattached = await getUnattachedOwnTrips(trip.vehicleId);
    const candidates = unattached.filter((t) => {
      const d = new Date(t.tripDate).getTime();
      return d >= trip.departureDate.getTime() && d <= closeDate.getTime();
    });
    if (candidates.length > 0) {
      return NextResponse.json({ needsConfirmation: true, unattachedTrips: candidates }, { status: 409 });
    }
  }

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

  // Отменённая заявка (Этап 4 аудита) — не в счёт "сколько заявок вёз этот рейс".
  const matched = await prisma.trip.findMany({
    where: { vehicleTripId: trip.id, NOT: { status: 'cancelled' } },
    select: { id: true },
  });

  const closed = await prisma.vehicleTrip.update({
    where: { id: trip.id },
    data: {
      status: 'completed',
      closedAt: new Date(),
      closedByUserId: userId ?? null,
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
