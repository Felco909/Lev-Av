export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getUnattachedOwnTrips, getAvailableTripsForAttach } from '@/lib/vehicle-trips/attach-service';

/**
 * Заявки собственного транспорта, у которых уже назначена машина, но ещё нет
 * рейса (vehicleTripId=null) — раздел "Ожидают привязки к рейсу" и предложение
 * привязки при создании нового рейса (см. Этап 2 архитектуры "заявка → рейс").
 *
 * excludeVehicleTripId — если передан (пикер "Добавить заявки" внутри конкретного рейса),
 * список расширяется: помимо непривязанных, показываются и заявки, уже привязанные к
 * ДРУГОМУ рейсу той же машины — независимо от его статуса (рейс полностью редактируем
 * всегда, переработка модуля "Рейсы", 2026-07-23) — чтобы можно было перенести заявку,
 * а не только добавить свободную (см. lib/vehicle-trips/attach-service.ts).
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const vehicleId = req.nextUrl.searchParams.get('vehicleId') || undefined;
  const excludeVehicleTripId = req.nextUrl.searchParams.get('excludeVehicleTripId') || undefined;

  const trips = vehicleId && excludeVehicleTripId
    ? await getAvailableTripsForAttach(vehicleId, excludeVehicleTripId)
    : await getUnattachedOwnTrips(vehicleId);

  return NextResponse.json({ trips, count: trips.length });
}
