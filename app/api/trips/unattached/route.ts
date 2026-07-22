export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getUnattachedOwnTrips } from '@/lib/vehicle-trips/attach-service';

/**
 * Заявки собственного транспорта, у которых уже назначена машина, но ещё нет
 * рейса (vehicleTripId=null) — раздел "Ожидают привязки к рейсу" и предложение
 * привязки при создании нового рейса (см. Этап 2 архитектуры "заявка → рейс").
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const vehicleId = req.nextUrl.searchParams.get('vehicleId') || undefined;
  const trips = await getUnattachedOwnTrips(vehicleId);
  return NextResponse.json({ trips, count: trips.length });
}
