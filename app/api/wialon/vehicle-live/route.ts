export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getFleetSnapshot, WialonApiError } from '@/lib/wialon/client';

/**
 * Текущий снимок одной машины "прямо сейчас" — для кнопки "Обновить сейчас" на активном
 * рейсе (координаты/скорость/пробег/топливо). Переиспользует getFleetSnapshot (один пакетный
 * запрос по всему парку) вместо отдельной функции на один юнит — не дублирую логику разбора
 * lmsg/sens/counters, она уже есть и протестирована в Этапе 1.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });

  const wialonUnitId = req.nextUrl.searchParams.get('wialonUnitId');
  if (!wialonUnitId) return NextResponse.json({ error: 'Укажите wialonUnitId' }, { status: 400 });

  try {
    const fleet = await getFleetSnapshot();
    const unit = fleet.find((u) => String(u.unitId) === wialonUnitId);
    if (!unit) return NextResponse.json({ available: false, reason: 'unit_not_found' });

    return NextResponse.json({
      available: true,
      mileageKm: unit.mileageKm,
      fuelLevelL: unit.fuelLevelL,
      lat: unit.lat,
      lon: unit.lon,
      speedKmh: unit.speedKmh,
      lastMessageAt: unit.lastMessageAt ? unit.lastMessageAt.toISOString() : null,
    });
  } catch (e: any) {
    if (e instanceof WialonApiError) {
      return NextResponse.json({ available: false, reason: 'wialon_error', error: e.message });
    }
    console.error('[api/wialon/vehicle-live] Ошибка:', e);
    return NextResponse.json({ available: false, reason: 'wialon_error', error: e?.message ?? 'Неизвестная ошибка' });
  }
}
